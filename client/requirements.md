## Packages
framer-motion | Smooth entry animations and hover effects for the retro aesthetic
lucide-react | Standard icons for the UI

## Notes
- Tailwind Config - extend fontFamily:
  fontFamily: {
    mono: ["var(--font-mono)", "monospace"],
    display: ["var(--font-display)", "monospace"],
  }
- The app uses a dark "retro switchboard" aesthetic, defaulting to dark mode styling on the root.
- The webhook URL is dynamically generated based on window.location.origin to help the user configure Twilio.
