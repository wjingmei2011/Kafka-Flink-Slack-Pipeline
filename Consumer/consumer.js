const Kafka = require('@confluentinc/kafka-javascript'); // Import Kafka library
require("dotenv").config(); // Load environment variables from .env file

// Function to create a Kafka consumer
function createConsumer(config, onData) {
  const consumer = new Kafka.KafkaConsumer(config, {'auto.offset.reset': 'earliest'}); // Initialize consumer with config and offset reset policy

  return new Promise((resolve, reject) => {
    consumer
     .on('ready', () => {
    console.log('Consumer is ready and connected to the Kafka cluster.');
    resolve(consumer)}) // Resolve promise when consumer is ready
     .on('data', onData); // Attach onData callback to handle incoming messages
    consumer.connect(); // Connect the consumer to the Kafka cluster
  });
};


// Example function to demonstrate consumer usage
async function consumerExample() {
  const config = {
    // User-specific properties loaded from environment variables
    'bootstrap.servers': process.env.BOOTSTRAP_SERVERS, // Kafka broker addresses
    'sasl.username':     process.env.CLUSTER_API_KEY, // SASL username
    'sasl.password':     process.env.CLUSTER_API_SECRET, // SASL password

    // Fixed properties for secure connection
    'security.protocol': 'SASL_SSL', // Use SASL over SSL
    'sasl.mechanisms':   'PLAIN', // Authentication mechanism
    'group.id':          'kafka-javascript-getting-started' // Consumer group ID
  }

  let topic = "poems"; // Topic to subscribe to

  // Create and configure the consumer
  const consumer = await createConsumer(config, (message) => {
    const { key, value } = message;
    let k = key ? key.toString().padEnd(10, ' ') : 'null';
    console.log(`Consumed event from topic ${topic}: key = ${k} value = ${value}`);
  });


  consumer.subscribe([topic]); // Subscribe to the specified topic
  // ensuring theconsumer is subscriging to the topic
  console.log(`Subscribed to topic: ${topic}`);

  // Handle consumer events
  consumer.on('event.error', (err) => {
    console.error('Error from consumer:', err);
  });
  

  consumer.consume(); // Start consuming messages

  // Handle process termination gracefully
  process.on('SIGINT', () => {
    console.log('\nDisconnecting consumer ...');
    consumer.disconnect(); // Disconnect the consumer
  });
}

// Run the consumer example and handle errors
consumerExample()
  .catch((err) => {
    console.error(`Something went wrong:\n${err}`); // Log errors
    process.exit(1); // Exit the process with an error code
  });