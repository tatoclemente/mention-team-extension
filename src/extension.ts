import * as vscode from 'vscode';
import { MentionParser } from './core/mentionParser';
import { GitHubNotifier } from './providers/githubNotifier';
import { ConfigManager } from './core/configManager';
import { MentionCompletionProvider } from './providers/completionProvider';
import { MentionCodeLensProvider } from './providers/mentionCodeLensProvider';
import { MentionTracker } from './core/mentionTracker';
import { Mention } from './core/mentionParser';

export function activate(context: vscode.ExtensionContext) {
    const configManager = new ConfigManager();
    const mentionParser = new MentionParser();
    const githubNotifier = new GitHubNotifier(configManager);
    const completionProvider = new MentionCompletionProvider(configManager);
    const mentionTracker = new MentionTracker(context);
    const codeLensProvider = new MentionCodeLensProvider(mentionParser);
    
    // Hacer tracker accesible globalmente para CodeLens
    (global as any).mentionTracker = mentionTracker;

    // Comando para configurar la extensión
    const configureCommand = vscode.commands.registerCommand('teamMentions.configure', async () => {
        await configManager.configure();
        await completionProvider.refreshTeamMembers();
    });

    // Comando para escanear menciones
    const scanCommand = vscode.commands.registerCommand('teamMentions.scanMentions', async () => {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Scanning for mentions...",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });
                
                const mentions = await mentionParser.scanWorkspace();
                progress.report({ increment: 50, message: `Found ${mentions.length} mentions` });
                
                if (mentions.length === 0) {
                    vscode.window.showInformationMessage('No mentions found in workspace.');
                    return;
                }
                
                // Filtrar menciones ya enviadas
                const newMentions = mentions.filter(m => !mentionTracker.isSent(m));
                
                if (newMentions.length === 0) {
                    vscode.window.showInformationMessage('All mentions have already been sent.');
                    return;
                }
                
                const result = await githubNotifier.sendNotifications(newMentions);
                
                // Marcar como enviadas con su número de issue
                for (const mention of newMentions) {
                    const issueNumber = result.issues.get(mention);
                    await mentionTracker.markAsSent(mention, issueNumber);
                }
                
                // Detectar menciones borradas y cerrar sus issues
                const trackedMentions = mentionTracker.getAllTracked();
                for (const tracked of trackedMentions) {
                    const stillExists = mentions.some(m => 
                        m.file === tracked.file && m.line === tracked.line
                    );
                    
                    if (!stillExists && tracked.issueNumber) {
                        try {
                            await githubNotifier.closeIssue(tracked.issueNumber);
                            await mentionTracker.remove(tracked.hash);
                            console.log(`Closed issue #${tracked.issueNumber} (mention deleted)`);
                        } catch (error) {
                            console.error(`Failed to close issue #${tracked.issueNumber}:`, error);
                        }
                    }
                }
                
                progress.report({ increment: 100 });
                
                vscode.window.showInformationMessage(
                    `✅ Sent ${result.count} new mentions to GitHub (${mentions.length - newMentions.length} already sent)`
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Decorador para resaltar menciones
    const mentionDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(255, 215, 0, 0.2)',
        border: '1px solid rgba(255, 215, 0, 0.5)'
    });

    // Listener para cambios en el editor
    const activeEditorChange = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            updateDecorations(editor);
            // Inicializar estado de menciones para este documento
            const docUri = editor.document.uri.toString();
            if (!previousMentions.has(docUri)) {
                previousMentions.set(docUri, mentionParser.findMentionsInDocument(editor.document));
            }
        }
    });

    // Guardar estado anterior de menciones por documento
    const previousMentions = new Map<string, Mention[]>();
    let isHandlingDeletion = false;

    const documentChange = vscode.workspace.onDidChangeTextDocument(async event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document) {
            updateDecorations(editor);
            
            // No procesar si estamos manejando una eliminación
            if (isHandlingDeletion) return;
            
            // Detectar menciones borradas
            const docUri = event.document.uri.toString();
            const currentMentions = mentionParser.findMentionsInDocument(event.document);
            const prevMentions = previousMentions.get(docUri) || [];
            
            // Buscar menciones que estaban pero ya no están
            for (const prevMention of prevMentions) {
                const stillExists = currentMentions.some(m => 
                    m.line === prevMention.line && m.username === prevMention.username
                );
                
                if (!stillExists && mentionTracker.isSent(prevMention)) {
                    // Mención enviada fue borrada
                    isHandlingDeletion = true;
                    await handleMentionDeletion(prevMention, editor, event.document);
                    isHandlingDeletion = false;
                    return; // Salir para evitar múltiples alerts
                }
            }
            
            // Actualizar estado
            previousMentions.set(docUri, currentMentions);
        }
    });

    async function handleMentionDeletion(mention: Mention, editor: vscode.TextEditor, document: vscode.TextDocument) {
        const answer = await vscode.window.showWarningMessage(
            `Mention to @${mention.username} was deleted. Close GitHub issue?`,
            'Yes', 'No'
        );

        if (answer === 'Yes') {
            // Cerrar issue
            try {
                const issueNumber = mentionTracker.getIssueNumber(mention);
                if (issueNumber) {
                    await githubNotifier.closeIssue(issueNumber);
                }
                
                const hash = mentionTracker.getAllTracked().find(
                    t => t.file === mention.file && t.line === mention.line
                )?.hash;
                if (hash) {
                    await mentionTracker.remove(hash);
                }
                
                vscode.window.showInformationMessage('✅ Issue closed!');
                
                // Actualizar estado con menciones actuales
                const docUri = document.uri.toString();
                previousMentions.set(docUri, mentionParser.findMentionsInDocument(document));
            } catch (error) {
                vscode.window.showErrorMessage(`Error closing issue: ${error}`);
            }
        } else {
            // Hacer undo para recuperar
            await vscode.commands.executeCommand('undo');
            vscode.window.showInformationMessage('Mention restored');
            
            // Actualizar estado después del undo
            setTimeout(() => {
                const docUri = document.uri.toString();
                previousMentions.set(docUri, mentionParser.findMentionsInDocument(document));
            }, 100);
        }
        
        codeLensProvider.refresh();
    }

    function updateDecorations(editor: vscode.TextEditor) {
        const mentions = mentionParser.findMentionsInDocument(editor.document);
        const decorations = mentions.map(mention => {
            const line = editor.document.lineAt(mention.line).text;
            const atIndex = line.indexOf('@' + mention.username);
            const endIndex = atIndex + mention.username.length + 1;
            
            return {
                range: new vscode.Range(mention.line, atIndex, mention.line, endIndex),
                hoverMessage: `Mention: @${mention.username}`
            };
        });
        editor.setDecorations(mentionDecorationType, decorations);
    }

    // Comando para enviar una sola mención
    const sendSingleCommand = vscode.commands.registerCommand('teamMentions.sendSingleMention', async (mention: Mention) => {
        if (mentionTracker.isSent(mention)) {
            vscode.window.showInformationMessage('This mention was already sent to GitHub.');
            return;
        }

        try {
            const result = await githubNotifier.sendNotifications([mention]);
            const issueNumber = result.issues.get(mention);
            await mentionTracker.markAsSent(mention, issueNumber);
            vscode.window.showInformationMessage('✅ Mention sent to GitHub!');
            codeLensProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Comando para borrar mención
    const deleteMentionCommand = vscode.commands.registerCommand('teamMentions.deleteMention', async (mention: Mention) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        const answer = await vscode.window.showWarningMessage(
            'Delete mention and close GitHub issue?',
            'Yes', 'No'
        );

        if (answer !== 'Yes') return;

        try {
            // Activar flag para evitar detectar este borrado
            isHandlingDeletion = true;
            
            // Cerrar issue en GitHub
            const issueNumber = mentionTracker.getIssueNumber(mention);
            if (issueNumber) {
                await githubNotifier.closeIssue(issueNumber);
            }

            // Borrar todas las líneas del comentario
            await editor.edit(editBuilder => {
                const startLine = mention.line;
                const endLine = mention.endLine + 1; // +1 para incluir la línea de author
                const range = new vscode.Range(
                    startLine, 0,
                    endLine, 0
                );
                editBuilder.delete(range);
            });

            // Remover del tracking
            const hash = mentionTracker.getAllTracked().find(
                t => t.file === mention.file && t.line === mention.line
            )?.hash;
            if (hash) {
                await mentionTracker.remove(hash);
            }

            // Actualizar estado
            const docUri = editor.document.uri.toString();
            previousMentions.set(docUri, mentionParser.findMentionsInDocument(editor.document));
            
            vscode.window.showInformationMessage('✅ Mention deleted and issue closed!');
            codeLensProvider.refresh();
            
            // Desactivar flag
            isHandlingDeletion = false;
        } catch (error) {
            isHandlingDeletion = false;
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    // Registrar provider de autocompletado
    const completionDisposable = vscode.languages.registerCompletionItemProvider(
        { scheme: 'file' },
        completionProvider,
        '@'
    );

    // Registrar CodeLens provider
    const codeLensDisposable = vscode.languages.registerCodeLensProvider(
        { scheme: 'file' },
        codeLensProvider
    );

    // Actualizar CodeLens cuando cambia el documento
    const codeLensRefresh = vscode.workspace.onDidChangeTextDocument(() => {
        codeLensProvider.refresh();
    });

    context.subscriptions.push(configureCommand, scanCommand, sendSingleCommand, deleteMentionCommand, activeEditorChange, documentChange, completionDisposable, codeLensDisposable, codeLensRefresh);
}

export function deactivate() {}