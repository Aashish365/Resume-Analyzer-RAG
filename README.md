# 📄 Resume-Analyzer

A powerful, **fully local**, and state-of-the-art resume analysis tool. Using LangGraph RAG pipelines, MS Harrier embeddings, and Llama 3.2 via Ollama, it provides deep insights into candidate fit against job descriptions.

![Aesthetic Dashboard Preview](https://via.placeholder.com/800x450?text=Resume+Analyzer+Dashboard) *(Run locally to see the glassmorphism UI in action)*

## ✨ Features

-   **Deep RAG Analysis**: Uses a 6-node LangGraph pipeline for parsing, chunking, retrieval, scoring, and gap analysis.
-   **Local-First Architecture**: Zero cloud dependencies. Your resumes never leave your machine.
-   **Advanced PDF Parsing**: Leverages `OpenDataLoader` with XY-Cut++ for superior reading order, even for two-column resumes.
-   **Real-time Progress**: Visualized with a sleek Next.js 15 frontend with streaming status updates.
-   **Actionable Insights**: Returns match scores, missing/matched skills, experience gap analysis, and suggestions for improvement.

## 🛠 Tech Stack

-   **Backend**: FastAPI, Celery, Redis, PostgreSQL.
-   **AI Frameworks**: LangGraph, LangChain, Sentence-Transformers.
-   **LLM/Embeddings**: Llama 3.2 (via Ollama), MS Harrier 0.6B (Local).
-   **Vector Store**: ChromaDB.
-   **Frontend**: Next.js 15 (standalone), Vanilla CSS (Custom Design System).
-   **Infrastructure**: Docker Compose, Nginx.

## 🚀 Quick Start

### Prerequisites

-   [Docker & Docker Compose](https://docs.docker.com/get-docker/)
-   [Ollama](https://ollama.com/) (Optional, if running services individually)

### Steps

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/Resume-Analyzer.git
    cd Resume-Analyzer
    ```

2.  **Configure Environment**
    ```bash
    cp .env.example .env
    ```

3.  **Start Services**
    ```bash
    docker-compose up -d
    ```
    *Note: The first run may take a few minutes as it pulls the Llama 3.2 model and downloads the Harrier embedding model (~1.2GB).*

4.  **Access the App**
    -   Frontend: `http://localhost`
    -   API Docs: `http://localhost/api/docs`

## 🏗 Architecture

The system follows a stateful DAG (Directed Acyclic Graph) workflow:

1.  **Parse**: PDF to Markdown using layout-aware reading.
2.  **Chunk**: Token-based splitting for optimal context windows.
3.  **Embed**: Vector indexing using MS Harrier.
4.  **Retrieve**: Context-dense retrieval of resume sections.
5.  **Score**: LLM-driven scoring against job requirements.
6.  **Gap Analysis**: Final reasoning for missing qualifications.

For a detailed deep-dive, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## 🛡 Security & Privacy

This application is designed for **privacy**. All processing (PDF parsing, embedding, LLM inference) happens locally. No data is sent to external APIs or cloud providers.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---
Built with ❤️ by [Ashish]
