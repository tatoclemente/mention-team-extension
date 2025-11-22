import * as vscode from 'vscode';
import { MentionParser } from '../core/mentionParser';

export class MentionCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private mentionParser: MentionParser) {}

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const mentions = this.mentionParser.findMentionsInDocument(document);
        const codeLenses: vscode.CodeLens[] = [];

        for (const mention of mentions) {
            const range = new vscode.Range(mention.line, 0, mention.line, 0);
            codeLenses.push(new vscode.CodeLens(range));
        }

        return codeLenses;
    }

    resolveCodeLens(codeLens: vscode.CodeLens): vscode.CodeLens {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return codeLens;

        const mentions = this.mentionParser.findMentionsInDocument(editor.document);
        const mention = mentions.find(m => m.line === codeLens.range.start.line);
        
        if (!mention) return codeLens;

        const isSent = (global as any).mentionTracker?.isSent(mention);

        if (isSent) {
            codeLens.command = {
                title: '✅ Sent | 🗑️ Delete mention',
                command: 'teamMentions.deleteMention',
                arguments: [mention]
            };
        } else {
            codeLens.command = {
                title: '📤 Send mention to GitHub',
                command: 'teamMentions.sendSingleMention',
                arguments: [mention]
            };
        }

        return codeLens;
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
