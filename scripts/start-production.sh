#!/usr/bin/env bash
set -e

export NODE_OPTIONS='--max-old-space-size=4096'

cd .mastra/output
NODE_ENV=production exec node index.mjs
