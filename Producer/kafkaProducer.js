const { Kafka } = require('kafkajs'); // KafkaJS is used to interact with Kafka (produce/consume messages).
const Imap = require('imap'); // IMAP library is used to connect to an email server and fetch emails.
const { decode } = require('quoted-printable'); // For decoding quoted-printable email content.
const { TextDecoder } = require('util'); // For decoding UTF-8 text.
const {htmlToText} = require('html-to-text'); // Converts HTML content to plain text. 
const avro = require('avsc');  // Avro library is used for serialization and deserialization of messages.
require('dotenv').config(); // Loads environment variables from a `.env` file.


const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000; // Port for the server

// Basic Express server setup
app.get ('/', (req, res) => {
  res.send('Producer Server is running!'); // Basic endpoint to check server status
}
);
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Kafka configuration
const kafka = new Kafka({
  clientId: 'news-producer', // A unique identifier for this Kafka client.
  brokers: [process.env.BROKER_URL], // Replace with your Confluent Cloud broker(s).
  ssl: true, // Enable SSL for secure connection.
  sasl: {
    mechanism: 'plain', // SASL mechanism.
    username: process.env.CLUSTER_API_KEY, // Confluent Cloud API key.
    password: process.env.CLUSTER_API_SECRET, // Confluent Cloud API secret.
  },
});


const producer = kafka.producer(); // Create a Kafka producer instance to send messages to Kafka.

// IMAP configuration
const imap = new Imap({
  user: process.env.EMAIL, // Email address (loaded from environment variables).
  password: process.env.EMAIL_PASSWORD, // Email password or app-specific password.
  host: 'imap.gmail.com', // IMAP server for Gmail.
  port: 993, // IMAP over SSL port.
  tls: true, // Use TLS (secure connection).
  tlsOptions: { rejectUnauthorized: false }, // Disable certificate validation (not recommended for production).
});

// Helper function to open a mailbox
function openBox(cb) {
  imap.openBox('Tech News', false, cb); // Open the "Tech News" mailbox in read-write mode.
}

// Update the topic name to "technews"
const topicName = 'technews'; // Define the topic name

const emailSchema = avro.Type.forSchema({
  type: 'record', // Define the schema as a record.
  fields: [
    { name: 'seqno', type: 'int' }, // Sequence number of the email.
    { name: 'subject', type: 'string' }, // Subject of the email.
    { name: 'body', type: 'string' }, // Body of the email.
  ],
});
  
// Function to send email data to Kafka
async function sendToKafka(topic, message) {
  const serializedMessage = emailSchema.toBuffer(message); // Serialize the message using Avro schema.
  await producer.send({
    topic, // Kafka topic to send the message to.
    messages: [{ value: serializedMessage }], // The message payload (converted to AVRO).
  });
  console.log('📤 Sent to Kafka (avro):', message); // Log the message sent to Kafka.
}


// Event: When IMAP is ready
imap.once('ready', () => {
  openBox(async (err, box) => {
    if (err) throw err; // If there's an error opening the mailbox, throw it.

    console.log(`✅ Connected to: ${box.name}`); // Log the name of the mailbox.
    console.log(`📬 Total messages: ${box.messages.total}`); // Log the total number of messages in the mailbox.

    
    // search unread emails
    const search = imap.search(['UNSEEN',['SINCE', '17-JUNE-2025']], (err, results) => {
      if (err || !results.length) {
        console.log('Error during IMAP search or No unread emails found.');
        imap.end();
        return;
      };
      // Fetch unread emails
      const fetch = imap.fetch(results, {
        bodies: ['HEADER.FIELDS (SUBJECT)', 'TEXT'], // Fetch subject and body.
        struct: true, // Include the structure of the email (e.g., attachments).
      });

      // Event: When a message is fetched
      fetch.on('message', (msg, seqno) => {
        console.log(`🔹 Message #${seqno}`); // Log the sequence number of the message.
        let emailData = { seqno, subject: '', body: '' }; // Initialize an object to store email data.

        // Event: When the body of the message is being streamed
        msg.on('body', (stream, info) => {
          let buffer = ''; // Buffer to accumulate chunks of data.
          stream.on('data', (chunk) => (buffer += chunk.toString('utf8'))); // Append each chunk to the buffer.
          stream.on('end', () => {
            if (info.which === 'HEADER.FIELDS (SUBJECT)') {
              const parsedHeader = Imap.parseHeader(buffer); // Extract the subject from the header.
              if (parsedHeader.subject && parsedHeader.subject.length > 0) {
                emailData.subject = `*${parsedHeader.subject[0]}*`; // Parse the subject header.
              } else {
                emailData.subject = '*No Subject*'; // Default subject if none found.
              }
            } else if (info.which === 'TEXT') {
              try {
                const decoded = decode(buffer); // Decode quoted-printable content.
                let body = decoded.toString('utf-8'); // Decode UTF-8 text.

                // Check if the body contains HTML
                if (body.includes('<html') || body.includes('<body')) {
                  // Convert HTML to plain text
                  body = htmlToText(body, {
                    wordwrap: 230, // Set word wrap length
                    preserveNewlines: true, // Preserve newlines in the text
                    tags: {
                      a: {
                        options: {
                          format: (node, options) => {
                            const text = node.children[0]?.data || '';
                            const href = node.attribs.href || '';
                            if (
                              node.parent &&
                              node.parent.name &&
                              /^by\s+/i.test(node.parent.children?.[0]?.data || '') // parent starts with "by "
                            ) {
                              return text;
                            }
                            // If the text is a likely author name (capitalized words, 2-4 words), return just the text
                            if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(text.trim())) {
                              return text;
                            }
                            return `<${href}|*${text || 'Link'}*>`; // Format links as Slack hyperlinks
                          }
                        }
                      }
                    }
                  });
                }

                // Remove everything before and including "Together With ..."
                const togetherWithRegex = /[\s\S]*?Together With[^\n]*\n?/i;
                body = body.replace(togetherWithRegex, '');


                const tldrRegex = /^TLDR.*(?:\d{4}-\d{2}-\d{2})?/im; // Matches any line starting with TLDR (case-insensitive, multiline)
                const tldrMatch = body.match(tldrRegex);
                if (tldrMatch) {
                  body = body.substring(tldrMatch.index).trim();
                }

                // Remove content below "Love TLDR? Tell your friends and get rewards!"
                const tldrEndIndex = body.search(/Love TLDR\? Tell your friends and get rewards!/);
                if (tldrEndIndex !== -1) {
                  body = body.substring(0, tldrEndIndex).trim();
                }

                // Remove content below "how did we do today" (case-insensitive, inclusive)
                const feedbackIndex = body.search(/how did we do today/i);
                if (feedbackIndex !== -1) {
                  body = body.substring(0, feedbackIndex).trim();
                }

                // Remove MIME headers and boundary markers
                body = body.replace(/Content-Type:.*?(\r\n|\n|\r)+/g, '') // Remove Content-Type headers
                  .replace(/Content-Transfer-Encoding:.*?(\r\n|\n|\r)+/g, '') // Remove Content-Transfer-Encoding headers
                  .replace(/--.*?(\r\n|\n|\r)+/g, '') // Remove boundary markers
                  .replace(/(\r\n|\n|\r)+/g, '\n') // Normalize line breaks
                  .replace(/<[^>]+>/g, '') // Remove HTML tags
                  .replace(/[^\x20-\x7E\n]/g, '') // Remove non-ASCII characters
                  .replace(/^(?:[A-Z0-9 &]+)$/gm, (match) => `*${match.trim()}*`) // Bold capitalized subjects
                  .replace(/^\[|\]$/gm, '') // Remove stray brackets
                  .replace(/https?:\/\/\S+\.(png|jpg|jpeg|gif|svg)/gi, '') // Remove all image links (ending with .png, .jpg, .jpeg, .gif, .svg)
                  .replace(/^\s*by [A-Z][a-z]+(?: [A-Z][a-z]+)*.*(\n|$)/gim, '') // Remove lines starting with "by" followed by capitalized names
  

                emailData.body = body.trim(); // Store the decoded body.
              } catch (err) {
                console.error('Error decoding email body:', err);
                emailData.body = '(Unable to decode email body)';
              }
            }
          });
        });


        // Event: When the message fetching is complete
        msg.once('end', async () => {
          await sendToKafka(topicName, emailData); // Send the email data to Kafka.
        });
      });

      // Event: When all messages have been fetched

      fetch.on('end', () => {
        console.log('✅ Done fetching.'); // Log that fetching is complete.
        imap.addFlags(results, '\\Seen', () => {}); // Mark all processed emails as seen
        imap.end(); // Close the IMAP connection.
      });
      });
  });
});


// Event: On IMAP error
imap.once('error', (err) => {
  console.error('❌ IMAP error:', err); // Log any IMAP errors.
});

// Event: When IMAP connection closes
imap.once('end', () => {
  console.log('🔌 Connection closed.'); // Log when the IMAP connection is closed.
});

// Start the IMAP connection
(async () => {
  console.log('Connecting to IMAP and Kafka...'); // Log the start of the connection process.
  await producer.connect(); // Connect to the Kafka broker.
  imap.connect(); // Connect to the IMAP server.
})();