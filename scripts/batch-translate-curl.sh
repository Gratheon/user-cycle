#!/bin/bash

# Batch Translate Language - GraphQL Mutation Examples
# This shows how to call the batchTranslateLanguage mutation via curl

# Configuration
GRAPHQL_URL="http://localhost:4000/graphql"
USER_ID="1"  # Change this to your actual user ID
LANG_CODE="hi"  # Language code: zh, hi, ru, et, tr, pl, de, fr

echo "=== Batch Translation via GraphQL Mutation ==="
echo "Language: $LANG_CODE"
echo "GraphQL URL: $GRAPHQL_URL"
echo "User ID: $USER_ID"
echo ""

# Simple curl command
echo "Running mutation..."
curl -X POST "$GRAPHQL_URL" \
  -H "Content-Type: application/json" \
  -H "internal-userid: $USER_ID" \
  -d "{
    \"query\": \"mutation { batchTranslateLanguage(langCode: \\\"$LANG_CODE\\\") { success total processed skipped errors message } }\"
  }" | jq '.'

echo ""
echo "Done!"
echo ""
echo "Note: This mutation:"
echo "- Requires authentication (internal-userid header)"
echo "- Only works in dev mode (ENV_ID=dev)"
echo "- Processes all existing translation keys"
echo "- Skips already translated entries"
echo "- Returns summary statistics"

