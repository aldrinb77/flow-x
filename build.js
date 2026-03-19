const fs = require('fs');
const css = fs.readFileSync('c:/Users/hp/.gemini/antigravity/playground/crystal-andromeda/flowx/css.css', 'utf8');
const htmlBody = fs.readFileSync('c:/Users/hp/.gemini/antigravity/playground/crystal-andromeda/flowx/html.html', 'utf8');
const js = fs.readFileSync('c:/Users/hp/.gemini/antigravity/playground/crystal-andromeda/flowx/logic.js', 'utf8');

const completeHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FlowX - Personal Finance OS</title>
    <!-- PWA -->
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#07090f">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="FlowX">
    <link rel="apple-touch-icon" href="icon-192.png">

    <!-- Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- FontAwesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <!-- Core Libraries -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
    
    <!-- Phase 7-11 Libraries -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>

    <style>${css}</style>
</head>
<body>
${htmlBody}
<script>${js}</script>
</body>
</html>`;

fs.writeFileSync('c:/Users/hp/.gemini/antigravity/playground/crystal-andromeda/flowx/index.html', completeHTML);
console.log('index.html compiled successfully!');
