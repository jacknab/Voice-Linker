require('dotenv/config');
console.log('=== Environment Variables Debug ===');
console.log('ELEVENLABS_VOICE_ID_ROGER:', process.env.ELEVENLABS_VOICE_ID_ROGER);
console.log('ELEVENLABS_VOICE_ID_MM:', process.env.ELEVENLABS_VOICE_ID_MM);
console.log('ELEVENLABS_VOICE_ID_MW:', process.env.ELEVENLABS_VOICE_ID_MW);
console.log('ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? 'SET' : 'NOT SET');
