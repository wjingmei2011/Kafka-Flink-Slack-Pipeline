const {Kafka} = require('kafkajs'); // Import Kafka from kafkajs library
const axios = require('axios'); // Import axios for HTTP requests
const avro = require('avsc'); // Import avsc for Avro serialization
require('dotenv').config(); // Load environment variables from .env file


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
    clientId: 'news-consumer', // Unique identifier for this Kafka client
    brokers: [process.env.BROKER_URL], // Replace with your Confluent Cloud broker(s)
    ssl: true, // Enable SSL for secure connection
    sasl: {
        mechanism: 'plain', // SASL mechanism
        username: process.env.CLUSTER_API_KEY, // Confluent Cloud API key
        password: process.env.CLUSTER_API_SECRET, // Confluent Cloud API secret
    },
    });

// Create a Kafka consumer instance
const consumer = kafka.consumer({ groupId: 'news-consumer-group' }); // Consumer group ID

// Avro schema for deserializing messages
const emailSchema = avro.Type.forSchema({
    type: 'record', // Define the schema as a record
    fields: [
        { name: 'seqno', type: 'int' }, // Sequence number of the email
        { name: 'subject', type: 'string' }, // Subject of the email
        { name: 'body', type: 'string' }, // Body of the email
    ],
});

// Slack webhook URL for sending messages
const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL; // Load Slack webhook URL from environment variables

// Function to consume messages from Kafka
async function consumeMessages() {
    await consumer.connect(); // Connect the consumer to the Kafka cluster
    await consumer.subscribe({ topic: 'technews', fromBeginning: true }); // Subscribe to the 'technews' topic

    console.log('Consumer is ready and subscribed to topic: technews');

    // Start consuming messages
    await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
        try {
            const deserializedMessage = emailSchema.fromBuffer(message.value); // Deserialize the message using Avro schema
            console.log(`Consumed message from topic ${topic}:`, deserializedMessage);

            // Send the message to Slack
            await sendToSlack(deserializedMessage);
        } catch (error) {
            console.error('Error consuming message:', error.message); // Log any errors during message processing
            }
        }
    });
}
// Function to send Kafka messages to Slack
const MAX_BLOCK_TEXT = 2900; // Leave room for formatting

function splitIntoBlocks(text, maxLen) { // Function to split text into blocks of a specified maximum length
    const lines = text.split('\n');
    const blocks = [];
    let current = '';
    for (const line of lines) {
        if ((current + '\n' + line).length > maxLen) {
            blocks.push(current);
            current = line;
        } else {
            current += (current ? '\n' : '') + line;
        }
    }
    if (current) blocks.push(current);
    return blocks;
}


// Function to hyperlink headings in the email body
function hyperlinkHeadings(body) {
    const lines = body.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
        const heading = lines[i];
        const url = lines[i + 1];
        // Match headings followed by a URL
        if (
            heading &&
            url &&
            /^https?:\/\/\S+$/.test(url) &&
            heading.length < 300 // Ensure it's a heading, not a paragraph
        ) {
            // Embed the URL into the heading using Slack's hyperlink syntax
            result.push(`<${url}|${heading}>`);
            i++; // Skip the URL line
        } else {
            result.push(heading);
        }
    }
    return result.join('\n');
}

async function sendToSlack(message) {
    try {
        const hyperlinkedBody = hyperlinkHeadings(message.body);

        // Use the processed body here
        const bodyBlocks = splitIntoBlocks(hyperlinkedBody, MAX_BLOCK_TEXT);
        const slackBlocks = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Subject:* ${message.subject}\n*Body:*`
                }
            },
            ...bodyBlocks.map(chunk => ({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: chunk
                }
            }))
        ];

        const slackMessage = { blocks: slackBlocks };

        // Send the message to Slack using axios
        await axios.post(slackWebhookUrl, slackMessage);
        console.log('📤 Sent to Slack:', message.subject); // Log the message sent to Slack
    } catch (error) {
        console.error('Error sending message to Slack:', error.message); // Log any errors during Slack message sending
    }
}

// start the consumer
(async () => {
    try {
        await consumeMessages(); // Start consuming messages
    } catch (error) {
        console.error('Error in consumer:', error.message); // Log any errors during consumer initialization
        process.exit(1); // Exit the process with an error code
    }
}
)();

// Handle process termination gracefully        
process.on('SIGINT', async () => {
    console.log('\nDisconnecting consumer ...');
    await consumer.disconnect(); // Disconnect the consumer
    process.exit(0); // Exit the process gracefully
});
