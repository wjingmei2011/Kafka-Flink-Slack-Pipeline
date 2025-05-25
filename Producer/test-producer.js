// Import the IMAP library
const Imap = require('imap');

// Load environment variables from .env file
require('dotenv').config();

// Create a new IMAP connection using your Gmail + App Password
const imap = new Imap({
  user: process.env.EMAIL,               // Gmail address
  password: process.env.EMAIL_PASSWORD, // App Password (not Gmail password)
  host: 'imap.gmail.com',               // Gmail's IMAP server
  port: 993,                             // IMAP over SSL port
  tls: true,                              // Use secure TLS connection
  tlsOptions: {
    rejectUnauthorized: false // ← this disables cert validation
  }
});

// Helper function to open a mailbox (e.g., INBOX or label)
function openBox(cb) {
  imap.openBox('Tech News', false, cb); // false = read-write mode (can mark messages as seen)
}

// Event: When IMAP is ready (connection established)
imap.once('ready', () => {
  openBox((err, box) => {
    if (err) throw err;

    // Log mailbox name and total message count
    console.log(`✅ Connected to: ${box.name}`);
    console.log(`📬 Total messages: ${box.messages.total}`);

    // Fetch last message(s) based on sequence number
    // `${box.messages.total}:*` = start at last message, go to end (safe even if empty)
    const start = Math.max(1, box.messages.total - 4); // Start from 1 or last 4 messages
    const fetch = imap.seq.fetch(`${box.messages.total}:*`, {
      bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'], // Fetch only these headers
      struct: true                                    // Include message structure
    });

    // For each fetched message
    fetch.on('message', (msg, seqno) => {
      console.log(`🔹 Message #${seqno}`);

      // On message body stream
      msg.on('body', (stream) => {
        let buffer = '';

        // Accumulate chunks of data
        stream.on('data', (chunk) => (buffer += chunk.toString('utf8')));

        // When body is done, print it
        stream.on('end', () => console.log(buffer));
      });
    });

    // When all messages have been fetched
    fetch.once('end', () => {
      console.log('✅ Done fetching.');
      imap.end(); // Close IMAP connection
    });
  });
});

// Event: On IMAP error
imap.once('error', (err) => {
  console.error('❌ IMAP error:', err);
});

// Event: When IMAP connection closes
imap.once('end', () => {
  console.log('🔌 Connection closed.');
});

console.log('Connecting as:', imap._config.user);

// Start the IMAP connection
imap.connect();
