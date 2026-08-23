set shell := ["zsh", "-cu"]

render:
    env PATH=/opt/homebrew/opt/node@26/bin:$PATH npm run build
    env PATH=/opt/homebrew/opt/node@26/bin:$PATH npm run render

test:
    env PATH=/opt/homebrew/opt/node@26/bin:$PATH npm test

dev:
    env PATH=/opt/homebrew/opt/node@26/bin:$PATH npm run dev
