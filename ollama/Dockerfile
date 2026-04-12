# @ai-context Minimal Railway-ready Ollama service with optional model pre-pull.
# @ai-security The Ollama official image runs as root and expects it for model
# downloads to /root/.ollama, so we intentionally leave USER as root here.

FROM ollama/ollama:0.6.2

WORKDIR /app

COPY start.sh /app/start.sh

RUN chmod +x /app/start.sh

VOLUME ["/root/.ollama"]

EXPOSE 11434

CMD ["/app/start.sh"]
