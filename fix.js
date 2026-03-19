const fs = require('fs');
let code = fs.readFileSync('logic.js', 'utf8');
code = code.replace(/\\`/g, '`');
code = code.replace(/\\\$/g, '$');
fs.writeFileSync('logic.js', code);
console.log('Fixed logic.js');
