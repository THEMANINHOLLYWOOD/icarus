import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('/Users/andres/Desktop/Coding/Icarus/.env.local','utf8').split('\n').filter(l=>/^[A-Z_]+=/.test(l)).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')]));
export const oa = (path, opt={}) => fetch('https://api.openai.com'+path, { ...opt, headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, ...(opt.headers||{}) } });
