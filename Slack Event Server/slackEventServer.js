
const express = require('express');
const axios = require('axios');
const { App, ExpressReceiver } = require('@slack/bolt');
const Anthropic = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
dotenv.config(); // Load environment variables from .env file

const receiver =  new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET }); // Slack signing secret for verification

// Initialize Slack app with your existing tokens
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
  processBeforeResponse: true
});

const app = receiver.app; // Get the Express app from the receiver

// Handle Slack's URL verification challenge
app.post('/slack/events', express.json(), (req, res) => {
  if (req.body.type === 'url_verification') {
    return res.status(200).send(req.body.challenge);
  }
});

const PORT = process.env.PORT || 3000; // Port for the server

// Start the Express server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Initialize Anthropic client with your Claude API key
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Store to track which threads the bot has participated in
const participatingThreads = new Set();

// Auto-handler for app mentions
slackApp.event('app_mention', async ({ event, client, logger }) => {
  try {
    logger.info(`App mentioned: ${event.text}`);
    let threadToTrack;
    if (event.thread_ts) {
      // If this is in a thread, use the thread_ts (root of thread)
      threadToTrack = event.thread_ts;
    } else {
      // If this creates a new thread, use event.ts
      threadToTrack = event.ts;
    }
    
    participatingThreads.add(`${event.channel}-${threadToTrack}`);

    console.log(`Added threads: ${event.channel}-${threadToTrack}`);
    console.log(`Current participating threads:`, [...participatingThreads]);


    // Extract user message (remove @mention)
    const mentionRegex = /<@[A-Z0-9]+>/g;
    const userMessage = event.text.replace(mentionRegex, '').trim();
    // Extract files from the event if available
    const files = event.files || [];

    if (!userMessage && files.length === 0) {
      await client.chat.postMessage({
        channel: event.channel,
        text: "Hi! I was mentioned but didn't see a question. How can I help you?",
        thread_ts: event.thread_ts  // Reply in the same thread if available
      });
      return;
    }
    
    // Call your existing Claude/MCP logic
    const response = await generateClaudeResponse(userMessage, {
      channel: event.channel,
      user: event.user,
      timestamp: event.ts,
      files: files,
      client: client,
      thread_ts: event.thread_ts || event.ts // Use thread_ts if available
    });

    console.log(`Generated response: ${response}`);
    
    // Post response back to Slack
    await client.chat.postMessage({
      channel: event.channel,
      text: response,
      thread_ts: event.thread_ts
    });
    
  } catch (error) {
    logger.error('Error in app_mention handler:', error);
    
    await client.chat.postMessage({
      channel: event.channel,
      text: "Sorry, I encountered an error. Please try again."
    });
  }
});

// Auto-handler for direct messages  
slackApp.event('message', async ({ event, client, logger }) => {
  // Only handle DMs, ignore channel messages and bot messages
  if (event.subtype === 'bot_message' || event.bot_id) return;
  
  try {
    const files = event.files || [];

    if (event.channel_type === 'im')  {
      // This is a direct message

    logger.info(`Direct message: ${event.text}, channel: ${event.channel}`);
    
    const response = await generateClaudeResponse(event.text, {
      channel: event.channel,
      user: event.user,
      timestamp: event.ts,
      files: files,
      client: client
    });

    console.log(`Generated response: ${response}`);
    
    await client.chat.postMessage({
      channel: event.channel,
      text: response
    });
    return; 
  }
  } catch (error) {
    logger.error('Error in DM handler:', error);
    
    await client.chat.postMessage({
      channel: event.channel,
      text: "Sorry, I encountered an error. Please try again.",
      thread_ts: event.thread_ts // Reply in the same thread if available
    });
  }
});




// Function to get image from Slack file
async function getImageFromSlackFile(file, client) {
  try {
    // Use Slack's thumb URLs which are simpler to access
    const imageUrl = file.url_private || file.permalink_public;
    
    if (!imageUrl) {
      return null;
    }

    // Download image with Slack token
    const response = await axios.get(imageUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
      },
      responseType: 'arraybuffer'
    });

    const base64 = Buffer.from(response.data).toString('base64');
    
    return {
      type: file.mimetype || 'image/png',
      data: base64
    };
  } catch (error) {
    console.error('Error getting image:', error);
    return null;
  }
}

// Function to get recent channel history
async function getRecentChannelHistory(client, channelId, limit = 100) {
  try {
    const history = await client.conversations.history({
      channel: channelId,
      limit: limit
    });
    
    return history.messages
      .reverse() // Show oldest first
      .filter(msg => !msg.bot_id) // Filter out bot messages
      .map(msg => `${msg.user}: ${msg.text}`)
      .join('\n');
  } catch (error) {
    console.error('Error getting channel history:', error);
    return '';
  }
}

// Function to generate Claude response (integrate with your existing Claude logic)
async function generateClaudeResponse(userMessage, context) {
  try {

    let contextInfo = '';
    const recentHistory = await getRecentChannelHistory(context.client, context.channel, 50); // Get recent channel history
    if (recentHistory) {
      contextInfo = `\n\nRecent channel context:\n${recentHistory}\n\n`;
    }
    
    // Build content array - start with text
    const content = [{
      type: 'text',
      text: `You are May's Slack Agent, an AI assistant helping users in a Slack workspace. Here's the context: ${contextInfo}. A user asked: "${userMessage}". 
      You should respond in a helpful, direct, and concise manner. Search the web for the latest information if needed.
      Also ensure you follow Slack's markup formatting shown here: 1. bold - Surround text with asterisks: 
      *your text* 2.Italicize - Surround text with underscores: _your text_ 3. Hyperlink - Use <URL|text> format for links. 4. block quote - Add an angled bracket in front of text:
      >your text`
    }];

    // Add images if any exist
    if (context.files && context.files.length > 0) {
      for (const file of context.files) {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
          const imageData = await getImageFromSlackFile(file, context.client);
          if (imageData) {
            content.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.type,
                data: imageData.data
              }
            });
          }
        }
      }
    }

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ 
            role: 'user', 
            content: content
        }]
        });
    // Return the response text
    return response.content[0].text;
    
} catch (error) {
    console.error('Error generating Claude response:', error);
    throw error;
} 
}

// Start the Slack app
(async () => {
  try {
    console.log('⚡️ Slack Bolt app is set up with ExpressReceiver!');
  } catch (error) {
    console.error('Failed to start Slack app:', error);
  }
})();

// Basic Express server setup
app.get ('/', (req, res) => {
  res.send('Slack Event Server is running!'); // Basic endpoint to check server status
}
);
