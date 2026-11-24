import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { cn } from '@/utils/cn';

/**
 * Zone de dépôt d'un fichier : glisser-déposer ou clic/clavier pour parcourir. Un seul fichier ; le type est filtré par `accept`
 * (extensions) et la validation fine reste à l'appelant (`onFile`). Accessible : c'est un vrai champ fichier, focalisable et annoncé.
 */
export function FileDropzone({ accept, fileName, title, hint, browseLabel, changeLabel, onFile, disabled = false }: {
  accept: string;
  fileName?: string;
  title: string;
  hint: string;
  browseLabel: string;
  changeLabel: string;
  onFile: (file: File | undefined) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drag = (e: DragEvent<HTMLLabelElement>, on: boolean): void => {
    e.preventDefault();
    if (!disabled) setOver(on);
  };
  const drop = (e: DragEvent<HTMLLabelElement>): void => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  return (
    <label
      htmlFor={id}
      onDragEnter={(e) => drag(e, true)}
      onDragOver={(e) => drag(e, true)}
      onDragLeave={(e) => drag(e, false)}
      onDrop={drop}
      className={cn(
        'flex w-full cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed px-4 py-6 text-center transition-colors',
        'focus-within:ring-2 focus-within:ring-primary',
        over ? 'border-primary bg-primary-soft' : 'border-border bg-muted/30 hover:border-primary hover:bg-primary-soft',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ''; // permet de recharger le même fichier après l'avoir corrigé
        }}
      />
      {fileName ? <FileSpreadsheet className="size-8 text-primary-ink" aria-hidden /> : <UploadCloud className="size-8 text-muted-foreground" aria-hidden />}
      {fileName ? (
        <>
          <span className="max-w-full truncate text-sm font-medium text-foreground">{fileName}</span>
          <span className="text-xs font-medium text-primary-ink underline">{changeLabel}</span>
        </>
      ) : (
        <>
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="text-xs font-medium text-primary-ink underline">{browseLabel}</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </>
      )}
    </label>
  );
}
