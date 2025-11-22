import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';
import { ConfigManager } from '../core/configManager';
import { GitUtils } from '../utils/gitUtils';

export class MentionCompletionProvider implements vscode.CompletionItemProvider {
    private teamMembers: string[] = [];
    private octokit?: Octokit;

    constructor(private configManager: ConfigManager) {
        this.initializeOctokit();
        this.loadTeamMembers();
    }

    private initializeOctokit(): void {
        const token = this.configManager.getGitHubToken();
        if (token) {
            this.octokit = new Octokit({ auth: token });
        }
    }

    private async loadTeamMembers(): Promise<void> {
        if (!this.octokit) return;

        const repo = this.configManager.getRepository();
        if (!repo) return;

        const [owner, repoName] = repo.split('/');

        try {
            // Obtener colaboradores del repositorio
            const { data: collaborators } = await this.octokit.repos.listCollaborators({
                owner,
                repo: repoName
            });

            this.teamMembers = collaborators.map(user => user.login);
        } catch (error) {
            console.error('Error loading team members:', error);
        }
    }

    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const lineText = document.lineAt(position).text;
        const beforeCursor = lineText.substring(0, position.character);

        // Solo activar después de @ en comentarios
        if (!this.isInComment(beforeCursor) || !beforeCursor.includes('@')) {
            return [];
        }

        const lastAtIndex = beforeCursor.lastIndexOf('@');
        const prefix = beforeCursor.substring(lastAtIndex + 1);

        const currentUser = GitUtils.getCurrentUser();
        const currentDate = GitUtils.getCurrentDate();

        return this.teamMembers
            .filter(member => member.toLowerCase().startsWith(prefix.toLowerCase()))
            .map(member => {
                const item = new vscode.CompletionItem(member, vscode.CompletionItemKind.User);
                item.detail = 'Team member';
                
                // Crear snippet con autor y fecha automáticos
                const snippet = new vscode.SnippetString(
                    `${member} \${1:mensaje}\n//? author: @${currentUser} fecha: ${currentDate}`
                );
                item.insertText = snippet;
                item.documentation = `Mention ${member} with auto-filled author and date`;
                
                return item;
            });
    }

    private isInComment(text: string): boolean {
        const trimmed = text.trim();
        return trimmed.startsWith('//') || 
               trimmed.startsWith('#') || 
               trimmed.includes('/*') || 
               trimmed.includes('*');
    }

    async refreshTeamMembers(): Promise<void> {
        await this.loadTeamMembers();
    }


}