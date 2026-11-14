import TextAlign from '@tiptap/extension-text-align';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Ellipsis, Heading2, Heading3, Italic, LayoutTemplate,
  List, ListOrdered, Maximize2, Minimize2, Printer, Redo2, Strikethrough, Table as TableIcon, Underline as UnderlineIcon, Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';
import type { SectionId } from '../clinical/model';
import { buildReportHtml, printHtml } from '../print';
import { sanitizeDoc, type RichDoc } from './doc';
import { TemplateLibrary } from './TemplateLibrary';

interface Props {
  /** Libellé accessible de l'éditeur (obligatoire). */
  label: string;
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  disabled?: boolean;
  /** Section cible : filtre les modèles proposés. */
  target?: SectionId | 'report';
  minHeight?: string;
}

/** Nettoyage du collage (Word, pages web) : styles, classes, balises vides et commentaires retirés avant le filtrage par le schéma. */
export function cleanPastedHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(o:p|span|font|meta|link|style)\b[^>]*>/gi, '')
    .replace(/\s(style|class|id|lang|align)="[^"]*"/gi, '');
}

function ToolButton({ label, icon: Icon, active, disabled, onClick }: { label: string; icon: LucideIcon; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-40',
        active && 'bg-primary-soft text-primary-ink',
      )}
    >
      <Icon aria-hidden className="size-4" />
    </button>
  );
}

const Group = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div role="group" className={cn('flex items-center gap-0.5 border-e border-border pe-1.5 last:border-e-0', className)}>{children}</div>
);

function Toolbar({ editor, onTemplates, onFullscreen, fullscreen, onPrint }: { editor: Editor; onTemplates: () => void; onFullscreen: () => void; fullscreen: boolean; onPrint: () => void }) {
  const { t } = useTranslation('consultations');
  const [more, setMore] = useState(false);
  // Fonction (et non valeur) : `chain().focus()` déclenche une transaction, interdite pendant le rendu.
  const run = () => editor.chain().focus();
  const secondary = more ? 'flex' : 'hidden md:flex';
  return (
    <div role="toolbar" aria-label={t('editor.toolbar')} className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-muted p-1.5">
      <Group>
        <ToolButton label={t('editor.templates')} icon={LayoutTemplate} onClick={onTemplates} />
      </Group>
      <Group>
        <ToolButton label={t('editor.undo')} icon={Undo2} disabled={!editor.can().undo()} onClick={() => run().undo().run()} />
        <ToolButton label={t('editor.redo')} icon={Redo2} disabled={!editor.can().redo()} onClick={() => run().redo().run()} />
      </Group>
      <Group>
        <ToolButton label={t('editor.bold')} icon={Bold} active={editor.isActive('bold')} onClick={() => run().toggleBold().run()} />
        <ToolButton label={t('editor.italic')} icon={Italic} active={editor.isActive('italic')} onClick={() => run().toggleItalic().run()} />
        <ToolButton label={t('editor.underline')} icon={UnderlineIcon} active={editor.isActive('underline')} onClick={() => run().toggleUnderline().run()} />
        <ToolButton label={t('editor.strike')} icon={Strikethrough} active={editor.isActive('strike')} onClick={() => run().toggleStrike().run()} />
      </Group>
      <Group>
        <ToolButton label={t('editor.bullets')} icon={List} active={editor.isActive('bulletList')} onClick={() => run().toggleBulletList().run()} />
        <ToolButton label={t('editor.numbered')} icon={ListOrdered} active={editor.isActive('orderedList')} onClick={() => run().toggleOrderedList().run()} />
      </Group>
      <Group className={secondary}>
        <ToolButton label={t('editor.h2')} icon={Heading2} active={editor.isActive('heading', { level: 2 })} onClick={() => run().toggleHeading({ level: 2 }).run()} />
        <ToolButton label={t('editor.h3')} icon={Heading3} active={editor.isActive('heading', { level: 3 })} onClick={() => run().toggleHeading({ level: 3 }).run()} />
      </Group>
      <Group className={secondary}>
        <ToolButton label={t('editor.alignLeft')} icon={AlignLeft} active={editor.isActive({ textAlign: 'left' })} onClick={() => run().setTextAlign('left').run()} />
        <ToolButton label={t('editor.alignCenter')} icon={AlignCenter} active={editor.isActive({ textAlign: 'center' })} onClick={() => run().setTextAlign('center').run()} />
        <ToolButton label={t('editor.alignRight')} icon={AlignRight} active={editor.isActive({ textAlign: 'right' })} onClick={() => run().setTextAlign('right').run()} />
        <ToolButton label={t('editor.alignJustify')} icon={AlignJustify} active={editor.isActive({ textAlign: 'justify' })} onClick={() => run().setTextAlign('justify').run()} />
      </Group>
      <Group className={secondary}>
        <ToolButton label={t('editor.table')} icon={TableIcon} onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        {editor.isActive('table') && (
          <>
            <button type="button" className="h-9 rounded-md px-2 text-xs hover:bg-surface-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => run().addRowAfter().run()}>{t('editor.addRow')}</button>
            <button type="button" className="h-9 rounded-md px-2 text-xs hover:bg-surface-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => run().addColumnAfter().run()}>{t('editor.addColumn')}</button>
            <button type="button" className="h-9 rounded-md px-2 text-xs text-danger-ink hover:bg-surface-muted" onMouseDown={(e) => e.preventDefault()} onClick={() => run().deleteTable().run()}>{t('editor.deleteTable')}</button>
          </>
        )}
      </Group>
      <Group className="ms-auto">
        <ToolButton label={t('editor.moreTools')} icon={Ellipsis} active={more} onClick={() => setMore((v) => !v)} />
        <ToolButton label={t('editor.print')} icon={Printer} onClick={onPrint} />
        <ToolButton label={fullscreen ? t('editor.exitFullscreen') : t('editor.fullscreen')} icon={fullscreen ? Minimize2 : Maximize2} onClick={onFullscreen} />
      </Group>
    </div>
  );
}

/**
 * Éditeur de texte enrichi (Tiptap) pour la rédaction clinique libre. Le contenu est un document JSON filtré par `sanitizeDoc`.
 * Les données structurées (constantes, diagnostics, allergies…) restent dans leurs propres formulaires.
 */
export function RichTextEditor({ label, value, onChange, disabled = false, target, minHeight = '14rem' }: Props) {
  const { t } = useTranslation('consultations');
  const [fullscreen, setFullscreen] = useState(false);
  const [library, setLibrary] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false, codeBlock: false, code: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: sanitizeDoc(value),
    editable: !disabled,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      transformPastedHTML: cleanPastedHtml,
      attributes: { 'aria-label': label, 'aria-multiline': 'true', role: 'textbox', class: 'rte-content focus:outline-none' },
    },
    onUpdate: ({ editor: ed }) => onChange(sanitizeDoc(ed.getJSON())),
  });

  // Les champs verrouillés (consultation signée) deviennent en lecture seule, y compris côté éditeur.
  useEffect(() => {
    if (editor && editor.isEditable === disabled) editor.setEditable(!disabled);
  }, [editor, disabled]);

  function applyTemplate(doc: RichDoc, mode: 'replace' | 'append') {
    if (!editor) return;
    if (mode === 'replace') editor.commands.setContent(doc);
    else editor.chain().focus('end').insertContent(doc.content).run();
    onChange(sanitizeDoc(editor.getJSON()));
    setLibrary(false);
  }

  function print() {
    onChange(sanitizeDoc(editor?.getJSON()));
    printHtml(buildReportHtml({ title: label, facility: t('editor.printFacility'), patientLines: [], practitionerLines: [], sections: [{ title: label, doc: editor?.getJSON() }], footer: t('editor.printFooter') }));
  }

  if (!editor) return <div className="h-40 animate-pulse rounded-md bg-surface-muted" aria-busy="true" />;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-border bg-surface',
        fullscreen && 'fixed inset-0 z-50 flex flex-col rounded-none',
        disabled && 'opacity-90',
      )}
    >
      {!disabled && (
        <Toolbar editor={editor} onTemplates={() => setLibrary(true)} fullscreen={fullscreen} onFullscreen={() => setFullscreen((v) => !v)} onPrint={print} />
      )}
      <div className={cn('overflow-auto px-3 py-2', fullscreen && 'flex-1')} style={fullscreen ? undefined : { minHeight }}>
        <EditorContent editor={editor} />
      </div>
      {library && (
        <TemplateLibrary
          open
          onClose={() => setLibrary(false)}
          target={target}
          hasContent={editor.getText().trim() !== ''}
          onApply={applyTemplate}
        />
      )}
    </div>
  );
}
