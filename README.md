# 📄 Resume-Analyzer

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2015-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![LangGraph](https://img.shields.io/badge/AI-LangGraph-FF6F00?style=flat-square)](https://github.com/langchain-ai/langgraph)
[![Docker](https://img.shields.io/badge/Infrastructure-Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

**Resume-Analyzer** is a state-of-the-art, fully local intelligence tool designed to bridge the gap between candidates and job descriptions. By leveraging a sophisticated **LangGraph-driven RAG pipeline**, it provides granular match scoring, skill gap analysis, and actionable career insights—all without your data ever leaving your machine.

![Dashboard Preview](https://via.placeholder.com/800x450?text=Resume+Analyzer+Dashboard)
_Visualizing candidate-to-job fit with real-time streaming updates._

---

## 🚀 Key Features

- **Deep RAG Pipeline**: A 6-node stateful Directed Acyclic Graph (DAG) using LangGraph for precise parsing, retrieval, and reasoning.
- **Privacy-First Architecture**: Zero cloud dependencies. LLM inference (Llama 3.2), embeddings (MS Harrier), and vector storage (ChromaDB) run entirely locally.
- **Layout-Aware Parsing**: Utilizes `OpenDataLoader` with **XY-Cut++** to intelligently read complex two-column PDF resumes that standard parsers often break.
- **Asymmetric Retrieval**: Implements specialized embedding strategies for documents vs. queries (STS instructions) to ensure the most relevant resume sections are matched.
- **Real-time Progress**: A sleek Next.js 15 frontend that tracks every step of the analysis via Celery task states and progress milestones.

---

## 🏗 System Architecture

The system is built on a distributed microservices architecture, ensuring high performance even with heavy local LLM workloads.

### High-Level Workflow

1.  **Ingestion**: FastAPI validates the PDF and JD; Celery offloads the processing to a background worker.
2.  **The Pipeline**: The LangGraph engine manages state across 6 distinct nodes:
    - **Parse**: Layout-aware PDF to Markdown conversion.
    - **Chunk**: Token-based recursive splitting using Tiktoken.
    - **Embed**: Vectorization via **MS Harrier 0.6B** (Asymmetric encoding).
    - **Retrieve**: Context-dense matching of JD requirements to resume segments.
    - **Score**: LLM-driven quantitative evaluation (Llama 3.2).
    - **Gap Analysis**: Qualitative reasoning for missing qualifications and suggestions.
3.  **Delivery**: Results are persisted in PostgreSQL and streamed to the Next.js frontend via status polling.

### Service Topology

| Component        | Technology         | Role                                              |
| :--------------- | :----------------- | :------------------------------------------------ |
| **Orchestrator** | LangGraph          | Manages the stateful analysis logic & DAG nodes   |
| **Inference**    | Ollama (Llama 3.2) | Local LLM for scoring and reasoning               |
| **Vector DB**    | ChromaDB           | Local storage for high-dimensional embeddings     |
| **Worker**       | Celery + Redis     | Asynchronous task execution and message brokering |
| **Storage**      | PostgreSQL         | Persistent storage for historical job results     |
| **Proxy**        | Nginx              | Routes traffic between the Frontend and FastAPI   |

---

## 🛠 Tech Stack

- **Frontend**: Next.js 15 (Standalone), Vanilla CSS (Custom Design System), Lucide Icons.
- **Backend**: FastAPI, SQLAlchemy (Async), Pydantic V2.
- **AI/ML**: LangChain, LangGraph, Sentence-Transformers, Tiktoken.
- **Embeddings**: MS Harrier 0.6B (Asymmetric STS).
- **Infrastructure**: Docker Compose, Redis, Nginx.

---

## 🚦 Quick Start

### Prerequisites

- [Docker & Docker Compose](https://docs.docker.com/get-docker/)
- [Ollama](https://ollama.com/) (Service must be running or reachable)

### Installation

1.  **Clone the Repository**

    ```bash
    git clone [https://github.com/yourusername/Resume-Analyzer.git](https://github.com/yourusername/Resume-Analyzer.git)
    cd Resume-Analyzer
    ```

2.  **Environment Setup**

    ```bash
    cp .env.example .env
    ```

3.  **Launch Services**

    ```bash
    docker-compose up -d
    ```

    _Note: The initial run pulls the Llama 3.2 model and downloads the MS Harrier embeddings (~1.5GB total). Please allow a few minutes for the services to initialize._

4.  **Access the Application**
    - **Web UI**: `http://localhost`
    - **API Documentation**: `http://localhost/api/docs`

---

## 🔒 Security & Privacy

This application is designed for **maximum data sovereignty**:

- **Local Inference**: Your resume text is never sent to external APIs (OpenAI, Anthropic, etc.).
- **Automated Cleanup**: Uploaded PDFs are deleted immediately after the analysis pipeline completes.
- **Isolated Environments**: Every analysis session generates unique, isolated collections in the vector database to prevent context leakage.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

**Built by [Aashish](https://github.com/yourusername)**
