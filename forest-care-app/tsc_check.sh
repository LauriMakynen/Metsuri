#!/usr/bin/env bash
echo "=== BACKEND ===" ; cd /home/laurimakynen/Projects/Metsuri/Metsuri/forest-care-app/backend && npx tsc --noEmit 2>&1 ; echo "backend exit:$?"
echo "=== FRONTEND ===" ; cd /home/laurimakynen/Projects/Metsuri/Metsuri/forest-care-app/frontend && npx tsc --noEmit 2>&1 ; echo "frontend exit:$?"
