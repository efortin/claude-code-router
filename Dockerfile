FROM node:20-alpine

RUN npm install -g @musistudio/claude-code-router

EXPOSE 3456

# In container mode, ccr defaults to start command
ENTRYPOINT ["ccr"]
