#!/usr/bin/env tsx

import fs from "fs";
import path from "path";

const ENV_FILE = path.join(process.cwd(), ".env");

// Voice IDs to add
const voiceIdVars = [
  "ELEVENLABS_VOICE_ID_MM=wLoW00IP5kfH8oiOBAPp",
  "ELEVENLABS_VOICE_ID_MW=4tRn1lSkEn13EVTuqb0g", 
  "ELEVENLABS_VOICE_ID_ROGER=Rmv8zCb2IRE895dK1qWB"
];

function addMissingVoiceIds(): void {
  if (!fs.existsSync(ENV_FILE)) {
    console.error("❌ .env file not found");
    process.exit(1);
  }

  let content = fs.readFileSync(ENV_FILE, "utf8");
  let added = 0;

  for (const varLine of voiceIdVars) {
    const varName = varLine.split("=")[0];
    
    if (!content.includes(`${varName}=`)) {
      // Find the ElevenLabs section and add after ELEVENLABS_VOICE_ID
      const voiceIdRegex = /^ELEVENLABS_VOICE_ID=.*$/m;
      const match = content.match(voiceIdRegex);
      
      if (match) {
        content = content.replace(match[0], match[0] + "\n" + varLine);
        added++;
        console.log(`✅ Added ${varName}`);
      } else {
        // If no ELEVENLABS_VOICE_ID found, add at end of ElevenLabs section
        const elevenlabsSection = /# ─── ElevenLabs ──────────────────────────────────────────────────────────────[\s\S]*?(?=\n# ───|\n$)/;
        const sectionMatch = content.match(elevenlabsSection);
        
        if (sectionMatch) {
          const sectionEnd = sectionMatch[0].endsWith("\n") ? "" : "\n";
          content = content.replace(sectionMatch[0], sectionMatch[0] + sectionEnd + varLine);
          added++;
          console.log(`✅ Added ${varName}`);
        } else {
          console.log(`⚠️  Could not find ElevenLabs section, ${varName} not added`);
        }
      }
    } else {
      console.log(`ℹ️  ${varName} already exists`);
    }
  }

  if (added > 0) {
    fs.writeFileSync(ENV_FILE, content);
    console.log(`\n🎉 Added ${added} voice ID variables to .env`);
    console.log("🔄 Please rebuild and restart the application:");
    console.log("   npm run build");
    console.log("   npm start");
  } else {
    console.log("\n✨ All voice ID variables already present");
  }
}

addMissingVoiceIds();
