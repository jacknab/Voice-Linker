#!/bin/bash

echo "🎤 Voice ID Update Script"
echo "========================"

# Function to update a voice ID in .env
update_voice_id() {
    local key=$1
    local value=$2
    local env_file="/apps/chatline/.env"
    
    if grep -q "^${key}=" "$env_file"; then
        # Update existing key
        sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
        echo "✅ Updated ${key} = ${value}"
    else
        # Add new key
        echo "${key}=${value}" >> "$env_file"
        echo "➕ Added ${key} = ${value}"
    fi
}

# Show current voice IDs
echo "📋 Current Voice IDs:"
echo "Roger: $(grep '^ELEVENLABS_VOICE_ID_ROGER=' /apps/chatline/.env | cut -d'=' -f2)"
echo "MM: $(grep '^ELEVENLABS_VOICE_ID_MM=' /apps/chatline/.env | cut -d'=' -f2)"
echo "MW: $(grep '^ELEVENLABS_VOICE_ID_MW=' /apps/chatline/.env | cut -d'=' -f2)"
echo ""

# Ask for which voice ID to update
echo "Which voice ID do you want to update?"
echo "1) Roger"
echo "2) MM"
echo "3) MW"
echo "4) Show current values only"
echo "5) Exit"
read -p "Enter choice (1-5): " choice

case $choice in
    1)
        read -p "Enter new Roger voice ID: " new_id
        update_voice_id "ELEVENLABS_VOICE_ID_ROGER" "$new_id"
        ;;
    2)
        read -p "Enter new MM voice ID: " new_id
        update_voice_id "ELEVENLABS_VOICE_ID_MM" "$new_id"
        ;;
    3)
        read -p "Enter new MW voice ID: " new_id
        update_voice_id "ELEVENLABS_VOICE_ID_MW" "$new_id"
        ;;
    4)
        echo ""
        echo "📋 Current Voice IDs:"
        grep '^ELEVENLABS_VOICE_ID' /apps/chatline/.env
        echo ""
        exit 0
        ;;
    5)
        echo "👋 Exiting..."
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "🔄 Restarting application..."
./restart-app.sh

echo ""
echo "✅ Voice ID update complete!"
echo "📊 New values:"
grep '^ELEVENLABS_VOICE_ID' /apps/chatline/.env
