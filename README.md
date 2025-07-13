# Kafka-Flink-MCP Pipeline

A real-time data pipeline that fetches emails from Gmail, processes and publishes them into Kafka, enriches content, and automatically interacts with Slack users using a Claude-powered Slack event server.

## Overview and Use Case

This project automates real-time streaming of multiple **email-based newsletter sources** (e.g., New Stack Daily, TLDR Tech/Data) into Slack (or any interface of the user's choice), enriched by a Large Language Model (Claude) with web serch capability. 

### Value Proposition:
- **Unified News Feed**: Aggregate newsletters into a single, centralized platform for seamless and efficient reading.
- **Real-Time Interactivity**: Immediately engage with news content by asking follow-up questions directly in Slack, eliminating the need to switch between reading newsletters and interacting with chatbots.
- **Enhanced Contextual Understanding**: Use Claude’s powerful natural language processing capabilities to provide instant summaries, perform real-time searches, and answer queries, enriching your news consumption experience.

### Ideal Use Cases:
- Busy professionals needing quick, consolidated insights from multiple industry newsletters.
- Teams seeking an integrated workflow, combining content consumption and discussion in one intuitive interface.
- Anyone who values real-time access to interactive, contextually enriched news content within their daily communication tools.

### Workflow:
- **Fetch Emails**: Periodically checks Gmail via IMAP, parsing newsletters.
- **Produce to Kafka**: Serialized email data is published to Kafka topics.
- **Consume & Enrich**: Kafka consumer fetches emails, processes content (hyperlink formatting, summarization).
- **Post to Slack**: Automatically publishes formatted newsletters into Slack channels.
- **Slack Interaction via Claude**: Slack bot automatically responds to user mentions and direct messages using Claude AI, providing real-time intelligent interactions and enriched information via web search.


## 🛠️ Tech Stack

- **Kafka(Confluent Cloud)** – Messaging backbone; simplicity to set up and generous free credits (Thank you Confluent!)
- **KafkaJS** – Kafka integration
- **Avro** – Efficient serialization/deserialization
- **Slack & Slack Bolt SDK** – Real-time Slack bot interactions
- **Claude LLM (Anthropic API)** – Real-time content enrichment and responses with web search capability
- **Node.js & Express** – Server and event handling
- **IMAP (Gmail)** – Email retrieval & parsing
- **HTML-to-text** – Email content processing


## Rationale Behind Tech Choices

### Kafka (KafkaJS)
- **Why**: Highly scalable, fault-tolerant, integrates smoothly with real-time systems.
- **Use**: Decouples email fetching, message publishing to Kafka clusters and Slack posting.

### IMAP & HTML-to-Text
- **Why**: Reliable retrieval of Gmail emails and conversion to Slack-friendly markdown.
- **Use**: Extract structured content from HTML-based newsletters.

### Avro Serialization
- **Why**: Compact, schema-based serialization ensuring robust data compatibility.
- **Use**: Reduces message size, maintains consistency.

### Slack Bolt SDK
- **Why**: Simplifies Slack event handling and posting.
- **Use**: Easy handling of mentions, direct messages, and real-time interactions.

### Claude LLM (Anthropic)
- **Why**: Advanced natural language capabilities.
- **Use**: Generates intelligent responses, web searches, and interactions within Slack.


## 🛠️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- Kafka (Confluent Cloud) cluster API key and secret
- Gmail account and app password with IMAP enabled
- Slack bot configured via Slack App Management (slack bot/app token, webhook URL etc.)
- Claude API Key from Anthropic

## Testing the Pipeline
- **Step 1**: Send a test email to your configured Gmail account.
- **Step 2**: Check the Kafka Producer logs to confirm successful fetching of the email.
- **Step 3**: Verify that the Kafka Consumer correctly processes the email content and posts it to Slack.
- **Step 4**: Mention your Slack bot or send it a direct message (DM) to validate automated responses from Claude.


## 🧩 Future Enhancements
Apache Flink Integration: Add stream processing logic.

## 📄 License
Apache License 2.0 — see [LICENSE](https://www.apache.org/licenses/LICENSE-2.0) for details.


---

## Takeaways & Learnings
Building this pipeline provided valuable insights into creating real-time streaming systems, integrating AI-driven interactions, and managing complex dependencies. Key learnings include:

1. **Real-Time vs. Practical Constraints**
Despite using high-performance technologies like Kafka and Flink, upstream data fetching can introduce bottlenecks due to:

- IMAP server rate limitations.

- Network latency considerations.

- Batch processing to optimize costs.

2. **Slack Bot Permissions & Event Handling Complexity**
- Defining Slack bot permissions (e.g., thread history, channel history) and event subscription rules required careful consideration to balance functionality, performance and cost.

- Managing context was particularly challenging, especially when deciding how the bot should respond:
    - Directly in channels vs. threads.
    - Contextual understanding of messages within threads vs. the broader channel context.

3. **Robust Email Parsing & Output Formatting**

Ensuring accurate parsing of email content was critical:

- Diverse email formatting across different email clients made consistent extraction challenging (e.g. Multipart MIME, HTML, hybrid etc.)

- Parsing logic needed to accommodate these variations and align with Slack’s markdown formatting rules.

- Iterative testing was essential for achieving reliability.


Overall, building this pipeline reinforced the importance of carefully managing real-world constraints within streaming systems, thoughtfully designing conversational agents for effective user interactions, and implementing robust parsing logic for diverse content formats. These insights are essential for successfully integrating complex technologies and ensuring reliable, meaningful experiences in future data-driven applications.

