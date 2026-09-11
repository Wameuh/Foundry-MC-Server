import { execFileSync } from 'node:child_process';
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
