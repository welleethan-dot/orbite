#!/usr/bin/env python3
"""Fabrique les variantes d'Orbite à partir de index.html (+ css/ et js/ s'ils existent).

Usage :  python3 tools/build.py            (depuis la racine du dépôt)

Produit :
  - index.html        : met à jour le « ?v=VERSION » des fichiers css/js locaux (l'application elle-même).
  - sw.js             : CACHE = 'orbite-VERSION' (le mode hors ligne se renouvelle à chaque version).
  - beta/index.html   : version de test, en un seul fichier (sauvegarde séparée, outils de test, pas de mode hors ligne).
  - build/claude.html : copie pour le lien Claude, en un seul fichier (sans connexion au serveur).

VERSION vient de version.json. Le script s'arrête avec une erreur si une transformation ne s'applique pas
exactement une fois : mieux vaut un échec visible qu'une variante fabriquée à moitié.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OFFLINE_MSG = "Le classement en ligne fonctionne uniquement dans l'application : welleethan-dot.github.io/orbite"


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(text)


def once(text, old, new, what):
    n = text.count(old)
    if n != 1:
        sys.exit(f"ERREUR ({what}) : trouvé {n} fois au lieu d'une : {old[:70]!r}")
    return text.replace(old, new)


def stamp_assets(html, version):
    """css/… et js/… locaux : ajoute ou remplace ?v=VERSION (le cache du navigateur se renouvelle)."""
    return re.sub(r'((?:href|src)="(?:css|js)/[^"?]+)(?:\?v=[^"]*)?"', lambda m: f'{m.group(1)}?v={version}"', html)


def inline_assets(html):
    """Remplace <link …css/x.css> et <script src="js/x.js"> par leur contenu : un seul fichier autonome."""
    def css(m):
        return '<style>\n' + read(m.group(1)) + '</style>'
    def js(m):
        return '<script>\n' + read(m.group(1)) + '</script>'
    html = re.sub(r'<link rel="stylesheet" href="(css/[^"?]+)(?:\?v=[^"]*)?">', css, html)
    html = re.sub(r'<script src="(js/[^"?]+)(?:\?v=[^"]*)?"></script>', js, html)
    return html


def drop_service_worker(html, what):
    start = html.find('<script>\n// Offline support')
    if start < 0:
        sys.exit(f"ERREUR ({what}) : bloc du mode hors ligne introuvable")
    end = html.index('</script>', start) + len('</script>')
    return html[:start] + "<!-- pas de mode hors ligne ni d'installation dans cette variante -->" + html[end:]


def main():
    version = json.loads(read('version.json'))['version']

    # 1. Application : numéro de version des fichiers + cache du mode hors ligne
    app = stamp_assets(read('index.html'), version)
    write('index.html', app)
    sw = read('sw.js')
    sw = re.sub(r"const CACHE = '[^']*';", f"const CACHE = 'orbite-{version}';", sw, count=1)
    write('sw.js', sw)

    full = inline_assets(app)

    # 2. Adresse de test /beta/
    beta = full
    beta = once(beta, "const STORE_PREFIX = 'orbite.';", "const STORE_PREFIX = 'orbite-beta.';", 'beta')
    beta = once(beta, '<link rel="manifest" href="manifest.webmanifest">\n', '', 'beta')
    beta = once(beta, 'href="icons/apple-touch-icon.png"', 'href="../icons/apple-touch-icon.png"', 'beta')
    beta = once(beta, 'href="icons/icon-192.png"', 'href="../icons/icon-192.png"', 'beta')
    beta = once(beta, '<div class="eyebrow">Arcade · une touche</div>', f'<div class="eyebrow">Version de test · {version}</div>', 'beta')
    beta = once(beta, '<title>Orbite</title>', '<title>Orbite (test)</title>\n<meta name="robots" content="noindex">', 'beta')
    beta = drop_service_worker(beta, 'beta')
    write('beta/index.html', beta)

    # 3. Lien Claude : contenu de <head> et <body> seulement (la page Claude ajoute son propre squelette)
    head = full[full.index('<title>'):full.index('</head>')]
    body = full[full.index('<body>') + len('<body>'):full.rindex('</body>')]
    claude = head.replace('<title>Orbite</title>', '<title>Orbite</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1) + body
    claude = drop_service_worker(claude, 'claude')
    claude = once(claude, "async function rpc(fn, args){\n  let r;",
                  "async function rpc(fn, args){\n  { const err = new Error('reseau'); err.code = 'reseau'; throw err; }   // page Claude : connexions bloquées\n  let r;", 'claude')
    claude = once(claude, "'Impossible de charger le classement. Vérifiez votre connexion.'", '"' + OFFLINE_MSG + '"', 'claude')
    claude = once(claude, 'reseau: "Pas de connexion. Réessayez quand vous serez en ligne.",', 'reseau: "' + OFFLINE_MSG + '",', 'claude')
    claude = once(claude, "out.textContent = 'Partie enregistrée : elle sera envoyée au classement dès que vous serez en ligne.';",
                  'out.textContent = "' + OFFLINE_MSG + '";', 'claude')
    write('build/claude.html', claude)

    kb = lambda s: f"{len(s.encode('utf-8')) // 1024} Ko"
    print(f"Version {version} fabriquée :")
    print(f"  index.html         {kb(app)} (+ fichiers css/js)")
    print(f"  beta/index.html    {kb(beta)}")
    print(f"  build/claude.html  {kb(claude)}")
    print(f"  sw.js              CACHE = 'orbite-{version}'")


if __name__ == '__main__':
    main()
