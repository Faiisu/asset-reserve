import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const seedImages = {
  palletJack: {
    filename: "seed-pallet-jack.svg",
    url: "/uploads/assets/seed-pallet-jack.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFBEB"/>
      <stop offset="100%" stop-color="#FEF3C7"/>
    </linearGradient>
    <linearGradient id="jackYellow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FBBF24"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
    <linearGradient id="metalDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="24" fill="url(#bg)"/>
  
  <!-- Shadow -->
  <ellipse cx="200" cy="320" rx="140" ry="18" fill="#D97706" opacity="0.2"/>
  
  <!-- Forks -->
  <path d="M120 250 L310 250 L310 270 L140 270 Z" fill="url(#jackYellow)"/>
  <path d="M140 270 L310 270 L290 285 L130 285 Z" fill="#B45309"/>
  <path d="M100 235 L270 235 L270 250 L110 250 Z" fill="url(#jackYellow)"/>
  
  <!-- Wheels Front -->
  <circle cx="295" cy="285" r="14" fill="url(#metalDark)"/>
  <circle cx="295" cy="285" r="6" fill="#94A3B8"/>
  <circle cx="260" cy="250" r="10" fill="url(#metalDark)"/>
  
  <!-- Main Hydraulic Tower / Chassis -->
  <rect x="90" y="180" width="60" height="95" rx="8" fill="url(#jackYellow)"/>
  <rect x="98" y="190" width="44" height="75" rx="4" fill="#B45309" opacity="0.3"/>
  <rect x="105" y="170" width="30" height="20" rx="4" fill="url(#metalDark)"/>
  
  <!-- Handle / Steering Tiller -->
  <path d="M120 170 L85 95" stroke="url(#metalDark)" stroke-width="12" stroke-linecap="round"/>
  <path d="M65 90 L105 100" stroke="url(#metalDark)" stroke-width="14" stroke-linecap="round"/>
  <circle cx="85" cy="95" r="8" fill="#F59E0B"/>
  
  <!-- Rear Wheels -->
  <circle cx="110" cy="295" r="22" fill="url(#metalDark)"/>
  <circle cx="110" cy="295" r="10" fill="#CBD5E1"/>
  
  <!-- Label Tag -->
  <rect x="100" y="215" width="40" height="14" rx="2" fill="#FFFFFF"/>
  <text x="120" y="226" font-family="system-ui, sans-serif" font-size="8" font-weight="bold" fill="#B45309" text-anchor="middle">2.5 TON</text>
</svg>`,
  },

  handTruck: {
    filename: "seed-hand-truck.svg",
    url: "/uploads/assets/seed-hand-truck.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="htBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FEF2F2"/>
      <stop offset="100%" stop-color="#FEE2E2"/>
    </linearGradient>
    <linearGradient id="htRed" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EF4444"/>
      <stop offset="100%" stop-color="#B91C1C"/>
    </linearGradient>
    <linearGradient id="htSteel" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#64748B"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="24" fill="url(#htBg)"/>
  
  <!-- Shadow -->
  <ellipse cx="200" cy="330" rx="100" ry="14" fill="#B91C1C" opacity="0.15"/>
  
  <!-- Handles -->
  <path d="M165 70 C165 55, 190 55, 190 70 L190 290" fill="none" stroke="url(#htRed)" stroke-width="12" stroke-linecap="round"/>
  <path d="M215 70 C215 55, 240 55, 240 70 L240 290" fill="none" stroke="url(#htRed)" stroke-width="12" stroke-linecap="round"/>
  
  <!-- Grips -->
  <rect x="160" y="60" width="10" height="24" rx="3" fill="#1E293B"/>
  <rect x="235" y="60" width="10" height="24" rx="3" fill="#1E293B"/>
  
  <!-- Crossbars -->
  <line x1="170" y1="120" x2="235" y2="120" stroke="url(#htRed)" stroke-width="10" stroke-linecap="round"/>
  <line x1="170" y1="175" x2="235" y2="175" stroke="url(#htRed)" stroke-width="10" stroke-linecap="round"/>
  <line x1="170" y1="230" x2="235" y2="230" stroke="url(#htRed)" stroke-width="10" stroke-linecap="round"/>
  
  <!-- Bottom Plate / Toe Plate -->
  <path d="M150 290 L255 290 L275 320 L130 320 Z" fill="url(#htSteel)"/>
  
  <!-- Heavy Wheels -->
  <circle cx="145" cy="290" r="26" fill="#0F172A"/>
  <circle cx="145" cy="290" r="14" fill="#EF4444"/>
  <circle cx="145" cy="290" r="5" fill="#FFFFFF"/>
  
  <circle cx="260" cy="290" r="26" fill="#0F172A"/>
  <circle cx="260" cy="290" r="14" fill="#EF4444"/>
  <circle cx="260" cy="290" r="5" fill="#FFFFFF"/>
</svg>`,
  },

  barcodeScanner: {
    filename: "seed-barcode-scanner.svg",
    url: "/uploads/assets/seed-barcode-scanner.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="scBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F1F5F9"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
    <linearGradient id="scBody" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
    <linearGradient id="scAccent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="24" fill="url(#scBg)"/>
  
  <!-- Laser Beam -->
  <path d="M255 145 L340 135 L340 185 L255 175 Z" fill="#EF4444" opacity="0.18"/>
  <line x1="255" y1="160" x2="350" y2="160" stroke="#EF4444" stroke-width="4" stroke-linecap="round"/>
  
  <!-- Scanner Head -->
  <path d="M120 120 L250 135 L260 185 L140 195 Z" fill="url(#scBody)"/>
  <!-- Rubber Bumper Top -->
  <path d="M115 115 L245 130 L250 145 L118 135 Z" fill="url(#scAccent)"/>
  
  <!-- Scan Window -->
  <rect x="250" y="140" width="12" height="40" rx="2" fill="#0EA5E9"/>
  
  <!-- Handle -->
  <path d="M140 195 L175 310 L215 300 L185 190 Z" fill="url(#scBody)"/>
  <rect x="180" y="295" width="40" height="16" rx="4" fill="url(#scAccent)"/>
  
  <!-- Trigger -->
  <path d="M190 205 C205 210, 205 230, 190 235 Z" fill="#EF4444"/>
  
  <!-- Grip Pads -->
  <line x1="165" y1="240" x2="185" y2="235" stroke="#64748B" stroke-width="3" stroke-linecap="round"/>
  <line x1="170" y1="260" x2="190" y2="255" stroke="#64748B" stroke-width="3" stroke-linecap="round"/>
  <line x1="175" y1="280" x2="195" y2="275" stroke="#64748B" stroke-width="3" stroke-linecap="round"/>
</svg>`,
  },

  platformCart: {
    filename: "seed-platform-cart.svg",
    url: "/uploads/assets/seed-platform-cart.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="pcBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EFF6FF"/>
      <stop offset="100%" stop-color="#DBEAFE"/>
    </linearGradient>
    <linearGradient id="pcBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#1D4ED8"/>
    </linearGradient>
    <linearGradient id="pcHandle" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#94A3B8"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="24" fill="url(#pcBg)"/>
  
  <!-- Shadow -->
  <ellipse cx="200" cy="330" rx="130" ry="16" fill="#1E40AF" opacity="0.15"/>
  
  <!-- Handle Bar -->
  <path d="M100 130 C100 110, 130 110, 130 130 L130 260" fill="none" stroke="url(#pcHandle)" stroke-width="12" stroke-linecap="round"/>
  <line x1="100" y1="160" x2="130" y2="160" stroke="url(#pcHandle)" stroke-width="8"/>
  
  <!-- Platform Base -->
  <polygon points="80,265 290,240 335,275 125,300" fill="url(#pcBlue)"/>
  <!-- Non-slip Mat -->
  <polygon points="95,266 280,245 320,273 135,294" fill="#1E3A8A" opacity="0.7"/>
  <!-- Platform Side Edge -->
  <polygon points="125,300 335,275 335,285 125,310" fill="#1E40AF"/>
  <polygon points="80,265 125,300 125,310 80,275" fill="#1D4ED8"/>
  
  <!-- Wheels -->
  <circle cx="130" cy="315" r="16" fill="#0F172A"/>
  <circle cx="130" cy="315" r="8" fill="#94A3B8"/>
  <circle cx="310" cy="290" r="16" fill="#0F172A"/>
  <circle cx="310" cy="290" r="8" fill="#94A3B8"/>
  <circle cx="100" cy="285" r="12" fill="#0F172A"/>
  <circle cx="270" cy="265" r="12" fill="#0F172A"/>
</svg>`,
  },

  logicAnalyzer: {
    filename: "seed-logic-analyzer.svg",
    url: "/uploads/assets/seed-logic-analyzer.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="laBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#E2E8F0"/>
    </linearGradient>
    <linearGradient id="caseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#0F172A"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="24" fill="url(#laBg)"/>
  
  <!-- Device Chassis -->
  <rect x="90" y="130" width="220" height="140" rx="16" fill="url(#caseGrad)"/>
  <rect x="95" y="135" width="210" height="130" rx="12" fill="#1E293B"/>
  
  <!-- LED Indicator -->
  <circle cx="125" cy="165" r="6" fill="#10B981"/>
  <circle cx="125" cy="165" r="10" fill="#10B981" opacity="0.3"/>
  <text x="140" y="169" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#94A3B8">LOGIC PRO 16</text>
  
  <!-- Channel Pins -->
  <g fill="#EF4444"><circle cx="125" cy="205" r="4"/><circle cx="140" cy="205" r="4"/></g>
  <g fill="#F59E0B"><circle cx="155" cy="205" r="4"/><circle cx="170" cy="205" r="4"/></g>
  <g fill="#10B981"><circle cx="185" cy="205" r="4"/><circle cx="200" cy="205" r="4"/></g>
  <g fill="#3B82F6"><circle cx="215" cy="205" r="4"/><circle cx="230" cy="205" r="4"/></g>
  <g fill="#8B5CF6"><circle cx="245" cy="205" r="4"/><circle cx="260" cy="205" r="4"/></g>
  <g fill="#EC4899"><circle cx="275" cy="205" r="4"/></g>
  
  <!-- USB Port -->
  <rect x="180" y="270" width="40" height="10" rx="2" fill="#64748B"/>
  
  <!-- Digital Pulse Line -->
  <path d="M125 240 L160 240 L160 225 L195 225 L195 240 L230 240 L230 225 L265 225 L265 240 L275 240" fill="none" stroke="#38BDF8" stroke-width="2"/>
</svg>`,
  },

  oscilloscope: {
    filename: "seed-oscilloscope.svg",
    url: "/uploads/assets/seed-oscilloscope.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="oscBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F1F5F9"/>
      <stop offset="100%" stop-color="#CBD5E1"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" rx="24" fill="url(#oscBg)"/>
  
  <!-- Body -->
  <rect x="60" y="100" width="280" height="200" rx="14" fill="#334155"/>
  <rect x="65" y="105" width="270" height="190" rx="10" fill="#1E293B"/>
  
  <!-- Screen -->
  <rect x="80" y="125" width="150" height="130" rx="6" fill="#022C22"/>
  <path d="M80 160 L230 160 M80 190 L230 190 M80 220 L230 220 M120 125 L120 255 M155 125 L155 255 M190 125 L190 255" stroke="#064E3B" stroke-width="1"/>
  
  <!-- Sine Wave on screen -->
  <path d="M85 190 Q105 140, 125 190 T165 190 T205 190 T225 190" fill="none" stroke="#34D399" stroke-width="3"/>
  
  <!-- Knobs & Buttons -->
  <circle cx="265" cy="150" r="16" fill="#475569" stroke="#94A3B8" stroke-width="2"/>
  <circle cx="305" cy="150" r="12" fill="#475569" stroke="#94A3B8" stroke-width="2"/>
  <circle cx="265" cy="195" r="14" fill="#475569" stroke="#94A3B8" stroke-width="2"/>
  <circle cx="305" cy="195" r="12" fill="#475569" stroke="#94A3B8" stroke-width="2"/>
  
  <!-- BNC Connectors -->
  <circle cx="100" cy="275" r="8" fill="#E2E8F0"/><circle cx="100" cy="275" r="4" fill="#F59E0B"/>
  <circle cx="130" cy="275" r="8" fill="#E2E8F0"/><circle cx="130" cy="275" r="4" fill="#3B82F6"/>
  <circle cx="160" cy="275" r="8" fill="#E2E8F0"/><circle cx="160" cy="275" r="4" fill="#EC4899"/>
  <circle cx="190" cy="275" r="8" fill="#E2E8F0"/><circle cx="190" cy="275" r="4" fill="#10B981"/>
</svg>`,
  },

  camera: {
    filename: "seed-camera.svg",
    url: "/uploads/assets/seed-camera.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <defs>
    <linearGradient id="camBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FAFAFA"/>
      <stop offset="100%" stop-color="#E5E5E5"/>
    </linearGradient>
    <radialGradient id="lensGlass" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0284C7"/>
      <stop offset="60%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" rx="24" fill="url(#camBg)"/>
  
  <!-- Camera Body -->
  <rect x="75" y="135" width="250" height="155" rx="14" fill="#1E293B"/>
  <rect x="140" y="115" width="120" height="25" rx="6" fill="#1E293B"/>
  <rect x="255" y="125" width="40" height="10" rx="2" fill="#E11D48"/>
  
  <!-- Grip -->
  <path d="M75 135 L120 135 L120 290 L75 290 Z" fill="#0F172A"/>
  
  <!-- Lens Rings -->
  <circle cx="200" cy="215" r="68" fill="#334155"/>
  <circle cx="200" cy="215" r="58" fill="#0F172A"/>
  <circle cx="200" cy="215" r="48" fill="url(#lensGlass)"/>
  <!-- Glare -->
  <path d="M180 185 A35 35 0 0 1 220 185 A25 25 0 0 0 180 185 Z" fill="#38BDF8" opacity="0.6"/>
</svg>`,
  },

  wirelessMic: {
    filename: "seed-wireless-mic.svg",
    url: "/uploads/assets/seed-wireless-mic.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <rect width="400" height="400" rx="24" fill="#F8FAFC"/>
  <!-- Transmitter 1 -->
  <rect x="90" y="120" width="100" height="160" rx="14" fill="#0F172A"/>
  <rect x="100" y="130" width="80" height="70" rx="8" fill="#1E293B"/>
  <circle cx="140" cy="165" r="16" fill="#334155"/>
  <circle cx="140" cy="165" r="4" fill="#38BDF8"/>
  <rect x="110" y="245" width="60" height="6" rx="3" fill="#E2E8F0"/>
  
  <!-- Transmitter 2 -->
  <rect x="210" y="120" width="100" height="160" rx="14" fill="#0F172A"/>
  <rect x="220" y="130" width="80" height="70" rx="8" fill="#1E293B"/>
  <circle cx="260" cy="165" r="16" fill="#334155"/>
  <circle cx="260" cy="165" r="4" fill="#38BDF8"/>
  <rect x="230" y="245" width="60" height="6" rx="3" fill="#E2E8F0"/>
</svg>`,
  },

  onboardingKit: {
    filename: "seed-onboarding-kit.svg",
    url: "/uploads/assets/seed-onboarding-kit.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <rect width="400" height="400" rx="24" fill="#F1F5F9"/>
  <!-- Keyboard -->
  <rect x="70" y="180" width="190" height="85" rx="8" fill="#334155"/>
  <rect x="75" y="185" width="180" height="75" rx="4" fill="#1E293B"/>
  <g fill="#475569">
    <rect x="85" y="195" width="20" height="12" rx="2"/>
    <rect x="110" y="195" width="20" height="12" rx="2"/>
    <rect x="135" y="195" width="20" height="12" rx="2"/>
    <rect x="160" y="195" width="20" height="12" rx="2"/>
    <rect x="185" y="195" width="20" height="12" rx="2"/>
    <rect x="210" y="195" width="35" height="12" rx="2"/>
    <rect x="85" y="212" width="25" height="12" rx="2"/>
    <rect x="115" y="212" width="20" height="12" rx="2"/>
    <rect x="140" y="212" width="20" height="12" rx="2"/>
    <rect x="165" y="212" width="20" height="12" rx="2"/>
    <rect x="190" y="212" width="55" height="12" rx="2"/>
    <rect x="115" y="230" width="80" height="14" rx="2" fill="#64748B"/>
  </g>
  <!-- Mouse -->
  <rect x="280" y="180" width="50" height="85" rx="25" fill="#334155"/>
  <line x1="305" y1="180" x2="305" y2="215" stroke="#1E293B" stroke-width="2"/>
  <rect x="300" y="195" width="10" height="16" rx="5" fill="#94A3B8"/>
  <!-- Multiport Dock -->
  <rect x="130" y="125" width="140" height="40" rx="8" fill="#64748B"/>
  <rect x="140" y="132" width="120" height="26" rx="4" fill="#475569"/>
  <circle cx="155" cy="145" r="4" fill="#38BDF8"/>
  <rect x="175" y="141" width="18" height="8" rx="2" fill="#CBD5E1"/>
  <rect x="200" y="141" width="18" height="8" rx="2" fill="#CBD5E1"/>
  <rect x="225" y="141" width="18" height="8" rx="2" fill="#CBD5E1"/>
</svg>`,
  },

  ergonomicChair: {
    filename: "seed-ergonomic-chair.svg",
    url: "/uploads/assets/seed-ergonomic-chair.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
  <rect width="400" height="400" rx="24" fill="#F8FAFC"/>
  <!-- Headrest -->
  <rect x="160" y="70" width="80" height="28" rx="10" fill="#334155"/>
  <!-- Backrest -->
  <path d="M150 110 C150 100, 250 100, 250 110 L240 215 C240 225, 160 225, 160 215 Z" fill="#1E293B"/>
  <!-- Lumbar Support -->
  <rect x="165" y="175" width="70" height="15" rx="4" fill="#475569"/>
  <!-- Armrests -->
  <rect x="125" y="180" width="24" height="8" rx="4" fill="#0F172A"/>
  <line x1="135" y1="188" x2="155" y2="235" stroke="#334155" stroke-width="6"/>
  <rect x="251" y="180" width="24" height="8" rx="4" fill="#0F172A"/>
  <line x1="265" y1="188" x2="245" y2="235" stroke="#334155" stroke-width="6"/>
  <!-- Seat Cushion -->
  <path d="M140 230 L260 230 C270 230, 265 255, 255 255 L145 255 C135 255, 130 230, 140 230 Z" fill="#0F172A"/>
  <!-- Gas Lift & Star Base -->
  <rect x="194" y="255" width="12" height="45" fill="#64748B"/>
  <path d="M200 300 L140 330 M200 300 L260 330 M200 300 L200 335" stroke="#334155" stroke-width="8" stroke-linecap="round"/>
  <circle cx="140" cy="330" r="8" fill="#0F172A"/>
  <circle cx="260" cy="330" r="8" fill="#0F172A"/>
  <circle cx="200" cy="335" r="8" fill="#0F172A"/>
</svg>`,
  },
} as const;

export function ensureSeedImages(targetDir?: string): void {
  const assetsDir = targetDir ?? join(process.cwd(), "uploads", "assets");
  if (!existsSync(assetsDir)) {
    mkdirSync(assetsDir, { recursive: true });
  }

  for (const item of Object.values(seedImages)) {
    const filePath = join(assetsDir, item.filename);
    try {
      writeFileSync(filePath, item.svg.trim(), "utf8");
    } catch (err) {
      console.warn(`Could not write seed image ${item.filename}:`, err);
    }
  }
  console.log(`Ensured seed asset images in ${assetsDir}.`);
}
