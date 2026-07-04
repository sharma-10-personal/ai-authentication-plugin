#!/bin/bash

# Exit immediately if any command fails
set -e

# Configuration
SOURCE_HOST="localhost"
SOURCE_PORT="27017"
TARGET_URI="mongodb+srv://anands_db_user:hPRYXYzMUqyH9Vf9@cluster0.bx1lwrl.mongodb.net"
TEMP_DUMP_DIR="./mongo_dump_temp"

# Find available databases on localhost
echo "🔍 Fetching available databases on localhost..."
if ! command -v mongosh &> /dev/null; then
    echo "❌ Error: 'mongosh' is not installed or not in PATH."
    exit 1
fi

# Retrieve the databases as a space-separated list
DB_LIST=$(mongosh --quiet --host "$SOURCE_HOST" --port "$SOURCE_PORT" --eval "db.adminCommand('listDatabases').databases.map(d => d.name).join(' ')")

if [ -z "$DB_LIST" ]; then
    echo "❌ Error: Could not retrieve database list. Is MongoDB running locally?"
    exit 1
fi

echo "Available local databases:"
# Present a menu to select the database
select DB_NAME in $DB_LIST; do
    if [ -n "$DB_NAME" ]; then
        echo "Selected database: $DB_NAME"
        break
    else
        echo "Invalid selection, please try again."
    fi
done

# If DB_NAME is still empty, exit
if [ -z "$DB_NAME" ]; then
    echo "❌ No database selected. Exiting."
    exit 1
fi

# Ask for the target database name on the remote cluster
read -p "Enter the target database name on the remote cluster [default: $DB_NAME]: " TARGET_DB_NAME
TARGET_DB_NAME=${TARGET_DB_NAME:-$DB_NAME}

# Check if mongodump is installed
if ! command -v mongodump &> /dev/null; then
    echo "❌ Error: 'mongodump' is not installed."
    exit 1
fi

# Check if mongorestore is installed
if ! command -v mongorestore &> /dev/null; then
    echo "❌ Error: 'mongorestore' is not installed."
    exit 1
fi

# Clean up any existing temp directory
rm -rf "$TEMP_DUMP_DIR"
mkdir -p "$TEMP_DUMP_DIR"

echo "⏳ Step 1/3: Dumping database '$DB_NAME' from localhost..."
mongodump --host "$SOURCE_HOST" --port "$SOURCE_PORT" --db "$DB_NAME" --out "$TEMP_DUMP_DIR"

echo "⏳ Step 2/3: Restoring to remote cluster under database '$TARGET_DB_NAME'..."
DUMPED_PATH="$TEMP_DUMP_DIR/$DB_NAME"

if [ ! -d "$DUMPED_PATH" ]; then
    echo "❌ Dump directory does not exist: $DUMPED_PATH"
    rm -rf "$TEMP_DUMP_DIR"
    exit 1
fi

# Run mongorestore using --db to restore the collections to the selected database name
mongorestore --uri="$TARGET_URI" --db="$TARGET_DB_NAME" "$DUMPED_PATH"

echo "⏳ Step 3/3: Cleaning up temporary dump directory..."
rm -rf "$TEMP_DUMP_DIR"

echo "✅ Migration successfully completed!"
