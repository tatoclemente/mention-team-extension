import { Octokit } from '@octokit/rest';
import { ConfigManager } from '../core/configManager';
import { Mention } from '../core/mentionParser';

export class GitHubNotifier {
    async closeIssue(issueNumber: number): Promise<void> {
        if (!this.octokit) {
            throw new Error('GitHub not configured.');
        }

        const repo = this.configManager.getRepository();
        if (!repo) {
            throw new Error('Repository not configured.');
        }

        const [owner, repoName] = repo.split('/');

        await this.octokit.issues.update({
            owner,
            repo: repoName,
            issue_number: issueNumber,
            state: 'closed'
        });
    }
    private octokit?: Octokit;

    constructor(private configManager: ConfigManager) {
        this.initializeOctokit();
    }

    private initializeOctokit(): void {
        const token = this.configManager.getGitHubToken();
        if (token) {
            this.octokit = new Octokit({ auth: token });
        }
    }

    async sendNotifications(mentions: Mention[]): Promise<{ count: number; issues: Map<Mention, number> }> {
        if (!this.octokit) {
            throw new Error('GitHub not configured. Run "Team Mentions: Configure" first.');
        }

        const repo = this.configManager.getRepository();
        if (!repo) {
            throw new Error('Repository not configured.');
        }

        const [owner, repoName] = repo.split('/');
        const method = this.configManager.getNotificationMethod();
        let successCount = 0;
        const issueMap = new Map<Mention, number>();

        for (const mention of mentions) {
            try {
                const issueNumber = await this.sendNotification(owner, repoName, mention, method);
                if (issueNumber) {
                    issueMap.set(mention, issueNumber);
                }
                successCount++;
            } catch (error) {
                console.error(`Failed to notify @${mention.username}:`, error);
            }
        }

        return { count: successCount, issues: issueMap };
    }

    private async sendNotification(owner: string, repo: string, mention: Mention, method: string): Promise<number | undefined> {
        const title = `@${mention.username} - ${mention.message.substring(0, 50)}${mention.message.length > 50 ? '...' : ''}`;
        const body = this.formatMentionBody(mention);

        switch (method) {
            case 'issue':
                const response = await this.octokit!.issues.create({
                    owner,
                    repo,
                    title,
                    body,
                    assignees: [mention.username],
                    labels: ['team-mention']
                });
                return response.data.number;
            case 'discussion':
                await this.createDiscussion(owner, repo, title, body, mention.username);
                return undefined;
            default:
                throw new Error(`Unsupported notification method: ${method}`);
        }
    }

    private async createDiscussion(owner: string, repo: string, title: string, body: string, username: string): Promise<void> {
        // GitHub Discussions usa GraphQL
        const query = `
            mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
                createDiscussion(input: {
                    repositoryId: $repositoryId
                    categoryId: $categoryId
                    title: $title
                    body: $body
                }) {
                    discussion {
                        id
                        url
                    }
                }
            }
        `;

        // Primero obtener IDs necesarios
        const repoQuery = `
            query($owner: String!, $repo: String!) {
                repository(owner: $owner, name: $repo) {
                    id
                    discussionCategories(first: 10) {
                        nodes {
                            id
                            name
                        }
                    }
                }
            }
        `;

        const repoData: any = await this.octokit!.graphql(repoQuery, { owner, repo });
        const repositoryId = repoData.repository.id;
        
        // Buscar categoría "General" o usar la primera disponible
        const category = repoData.repository.discussionCategories.nodes.find((c: any) => 
            c.name === 'General' || c.name === 'Q&A'
        ) || repoData.repository.discussionCategories.nodes[0];

        if (!category) {
            throw new Error('No discussion categories found. Enable Discussions in your repository.');
        }

        const bodyWithMention = `@${username}\n\n${body}`;

        await this.octokit!.graphql(query, {
            repositoryId,
            categoryId: category.id,
            title,
            body: bodyWithMention
        });
    }

    private formatMentionBody(mention: Mention): string {
        let relativePath = mention.file;
        
        // Obtener path relativo al workspace
        const vscode = require('vscode');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            relativePath = mention.file.replace(workspaceFolder.uri.fsPath, '').replace(/^[\\\/]/, '');
        }
        
        // Crear link a GitHub
        const repo = this.configManager.getRepository();
        const branch = this.getCurrentBranch();
        const githubLink = repo && branch 
            ? `https://github.com/${repo}/blob/${branch}/${relativePath}#L${mention.line + 1}`
            : null;
        
        // Obtener snippet del código
        const codeSnippet = this.getCodeSnippet(mention);
        const fileExtension = relativePath.split('.').pop() || '';
        const languageMap: { [key: string]: string } = {
            'ts': 'typescript', 'js': 'javascript', 'py': 'python',
            'java': 'java', 'cpp': 'cpp', 'c': 'c', 'cs': 'csharp',
            'rb': 'ruby', 'go': 'go', 'php': 'php', 'rs': 'rust'
        };
        const language = languageMap[fileExtension] || '';
        
        const fileDisplay = githubLink 
            ? `[${relativePath}](${githubLink})`
            : `\`${relativePath}\``;
            
        return `
**Message:** ${mention.message}

**File:** ${fileDisplay}
**Line:** ${mention.line + 1}
**Author:** @${mention.author}
**Date:** ${mention.date}

**Code Context:**
\`\`\`${language}
${codeSnippet}
\`\`\`

---
*Generated by Team Mentions extension*
        `.trim();
    }

    private getCodeSnippet(mention: Mention): string {
        try {
            const fs = require('fs');
            const content = fs.readFileSync(mention.file, 'utf8');
            const lines = content.split('\n');
            
            const startLine = mention.endLine + 1;
            const endLine = Math.min(startLine + 10, lines.length);
            
            return lines.slice(startLine, endLine).join('\n') || '// No code context available';
        } catch (error) {
            return '// Error reading file';
        }
    }

    private getCurrentBranch(): string {
        try {
            const { execSync } = require('child_process');
            const vscode = require('vscode');
            const branch = execSync('git rev-parse --abbrev-ref HEAD', {
                encoding: 'utf8',
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            }).trim();
            return branch;
        } catch (error) {
            return 'main';
        }
    }
}