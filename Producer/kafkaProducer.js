const { Kafka } = require('kafkajs'); // KafkaJS is used to interact with Kafka (produce/consume messages).
const Imap = require('imap'); // IMAP library is used to connect to an email server and fetch emails.
const { decode } = require('quoted-printable'); // For decoding quoted-printable email content.
const { TextDecoder } = require('util'); // For decoding UTF-8 text.
require('dotenv').config(); // Loads environment variables from a `.env` file.

// Kafka configuration
const kafka = new Kafka({
  clientId: 'news-producer', // A unique identifier for this Kafka client.
  brokers: ['pkc-p11xm.us-east-1.aws.confluent.cloud:9092'], // Replace with your Confluent Cloud broker(s).
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

// Function to send email data to Kafka
async function sendToKafka(topic, message) {
  
  await producer.connect(); // Connect to the Kafka broker.
  await producer.send({
    topic, // Kafka topic to send the message to.
    messages: [{ value: JSON.stringify(message) }], // The message payload (converted to JSON).
  });
  console.log('📤 Sent to Kafka:', message); // Log the message sent to Kafka.
}
// Update the topic name to "technews"
const topicName = 'technews'; // Define the topic name

// Replace the placeholder with the updated topic name
await sendToKafka(topicName, emailData); // Send the email data to Kafka using the "technews" topic
// Event: When IMAP is ready
imap.once('ready', () => {
  openBox(async (err, box) => {
    if (err) throw err; // If there's an error opening the mailbox, throw it.

    console.log(`✅ Connected to: ${box.name}`); // Log the name of the mailbox.
    console.log(`📬 Total messages: ${box.messages.total}`); // Log the total number of messages in the mailbox.

    // Fetch unread emails

    const fetch = imap.search(['UNSEEN'], (err, results) => {
      if (err || !results.length) {
        console.log('No unread emails found.');
        imap.end();
        return;
      }

      const latestEmail = [results[results.length - 1]];
      const fetch = imap.fetch(latestEmail, {
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
              emailData.subject = buffer.match(/Subject: (.*)/)[1].trim(); // Extract the subject line. what does it mean??
            } else if (info.which === 'TEXT') {
              try {
                const decoded = decode(buffer); // Decode quoted-printable content.
                emailData.body = new TextDecoder('utf-8').decode(decoded); // Decode UTF-8 text.
              } catch (err) {
                console.error('Error decoding email body:', err);
              }
            }
          });
        });

        // Event: When the message fetching is complete
        msg.once('end', async () => {
          await sendToKafka('emails', emailData); // Send the email data to Kafka.
        });
      });

      // Event: When all messages have been fetched
      fetch.once('end', () => {
        console.log('✅ Done fetching.'); // Log that fetching is complete.
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
  imap.connect(); // Connect to the IMAP server.
})();