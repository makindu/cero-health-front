# Module Consultation médicale — architecture frontend

- `consultations/ConsultationsPage.tsx` : liste (inchangée) ; le détail renvoie vers l'espace de consultation.
- `consultations/ConsultationWorkspace.tsx` (route `/consultations/:id`) : 7 sections navigables avec progression, brouillon, statuts, synthèse imprimable, addendum, historique.
- `consultations/sections-a.tsx`, `sections-b.tsx` : sections (général, anamnèse, antécédents, examen, diagnostics, conduite à tenir).
- `consultations/clinical/` : `model.ts` (types), `logic.ts` (règles pures testées : statuts, IMC, antécédents versionnés, diagnostics, signature, addendum, traçabilité), `icd10.ts` (suggestions), `fields.tsx`.
- `consultations/richtext/` : `doc.ts` (JSON, assainissement, rendu HTML sûr), `RichTextEditor.tsx` (**unique** éditeur, Tiptap), `TemplateLibrary.tsx`, `templates.ts` (8 modèles communs = trames sans contenu clinique).
- `consultations/report.ts`, `print.ts` : compte rendu imprimable / PDF via la boîte d'impression du navigateur.

## Dépendances à installer
```
pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-text-align @tiptap/extension-table
```
(Tiptap 3.x : `StarterKit` inclut déjà souligné ; liens désactivés volontairement.)

## Sécurité
Contenu riche stocké en JSON, filtré à la lecture (`sanitizeDoc`) et rendu en HTML échappé (`renderDocToHtml`). Aperçu dans un `<iframe sandbox>`. Collage nettoyé. Consultation signée : champs en lecture seule, seul un addendum est possible. Rien n'est enregistré en démonstration, et l'interface le dit.
