#!/usr/bin/env node
// Entwicklungswerkzeug für .cueshow-Dateien: entpacken, packen, prüfen, Übersicht, Texte. Hilfe: node tools/cueshow.mjs help
import { main } from './cueshow/cli.mjs';

process.exitCode = await main(process.argv.slice(2));
