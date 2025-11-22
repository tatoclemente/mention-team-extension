import * as vscode from 'vscode';

export interface Mention {
    username: string;
    message: string;
    author: string;
    date: string;
    file: string;
    line: number;
    start: number;
    end: number;
    endLine: number; // Línea donde termina el comentario completo
}

export class MentionParser {
    private readonly mentionRegex = /\/\/\s*@(\w+)\s+(.+)/;
    private readonly authorRegex = /\/\/\?\s*author:\s*@(\w+)\s+fecha:\s*(.+)/;

    findMentionsInDocument(document: vscode.TextDocument): Mention[] {
        const mentions: Mention[] = [];
        
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            
            const mentionMatch = this.mentionRegex.exec(line.text);
            if (!mentionMatch) continue;
            
            // Buscar la línea de author (puede estar varias líneas después)
            let authorMatch = null;
            let endLine = i;
            let fullMessage = mentionMatch[2].trim();
            
            for (let j = i + 1; j < Math.min(i + 10, document.lineCount); j++) {
                const nextLine = document.lineAt(j).text;
                
                // Verificar si es la línea de author
                authorMatch = this.authorRegex.exec(nextLine);
                if (authorMatch) {
                    endLine = j;
                    break;
                }
                
                // Si es continuación del comentario, agregar al mensaje
                if (nextLine.trim().startsWith('//') && !nextLine.includes('author:')) {
                    fullMessage += ' ' + nextLine.replace(/^\/\/\s*/, '').trim();
                } else if (!nextLine.trim().startsWith('//')) {
                    // Si no es comentario, terminar búsqueda
                    break;
                }
            }
            
            mentions.push({
                username: mentionMatch[1],
                message: fullMessage,
                author: authorMatch ? authorMatch[1] : 'unknown',
                date: authorMatch ? authorMatch[2].trim() : new Date().toLocaleDateString(),
                file: document.fileName,
                line: i,
                start: mentionMatch.index,
                end: mentionMatch.index + mentionMatch[0].length,
                endLine: endLine
            });
        }
        
        return mentions;
    }

    async scanWorkspace(): Promise<Mention[]> {
        const mentions: Mention[] = [];
        const files = await vscode.workspace.findFiles(
            '**/*.{js,ts,py,java,cpp,c,cs,php,rb,go}', 
            '{**/node_modules/**,**/.amazonq/**,**/.vscode/**,**/logs/**,**/dist/**,**postgres/**,**/build/**,**/out/**,**/.git/**}',
            500 // Limitar a 500 archivos máximo
        );
        
        console.log(`Scanning ${files.length} files...`);
        
        // Procesar en lotes de 10 archivos en paralelo
        const batchSize = 10;
        for (let i = 0; i < files.length; i += batchSize) {
            const batch = files.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(async (file) => {
                    try {
                        const document = await vscode.workspace.openTextDocument(file);
                        return this.findMentionsInDocument(document);
                    } catch (error) {
                        console.error(`Error scanning ${file.fsPath}:`, error);
                        return [];
                    }
                })
            );
            
            results.forEach(found => {
                if (found.length > 0) {
                    mentions.push(...found);
                }
            });
        }
        
        console.log(`Total mentions found: ${mentions.length}`);
        return mentions;
    }

    private isCommentLine(line: string): boolean {
        const trimmed = line.trim();
        return trimmed.startsWith('//') || 
               trimmed.startsWith('#') || 
               trimmed.startsWith('/*') || 
               trimmed.includes('*') ||
               trimmed.startsWith('<!--');
    }
}