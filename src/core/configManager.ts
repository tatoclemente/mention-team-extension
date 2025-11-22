import * as vscode from 'vscode';
import { execSync } from 'child_process';

export class ConfigManager {
    async configure(): Promise<void> {
        const token = await vscode.window.showInputBox({
            prompt: 'GitHub Personal Access Token',
            password: true,
            placeHolder: 'ghp_xxxxxxxxxxxx'
        });

        if (token) {
            const config = vscode.workspace.getConfiguration('teamMentions');
            await config.update('githubToken', token, vscode.ConfigurationTarget.Global);
            
            // Intentar detectar el repositorio automáticamente
            const detectedRepo = this.detectRepository();
            if (detectedRepo) {
                await config.update('repository', detectedRepo, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`✅ Configured with repository: ${detectedRepo}`);
            } else {
                vscode.window.showWarningMessage('Could not detect repository automatically.');
            }
        }
    }

    private detectRepository(): string | undefined {
        try {
            const remote = execSync('git config --get remote.origin.url', { 
                encoding: 'utf8',
                cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
            }).trim();
            
            // Extraer owner/repo de URLs como:
            // https://github.com/owner/repo.git
            // git@github.com:owner/repo.git
            const match = remote.match(/github\.com[:\/]([^\/]+\/[^\/]+?)(\.git)?$/);
            if (match && match[1]) {
                return match[1];
            }
        } catch (error) {
            console.error('Error detecting repository:', error);
        }
        return undefined;
    }

    getGitHubToken(): string | undefined {
        return vscode.workspace.getConfiguration('teamMentions').get('githubToken');
    }

    getRepository(): string | undefined {
        const config = vscode.workspace.getConfiguration('teamMentions');
        let repo = config.get<string>('repository');
        
        // Si no está configurado, intentar detectarlo
        if (!repo) {
            repo = this.detectRepository();
            if (repo) {
                config.update('repository', repo, vscode.ConfigurationTarget.Workspace);
            }
        }
        
        return repo;
    }

    getNotificationMethod(): string {
        return vscode.workspace.getConfiguration('teamMentions').get('notificationMethod') || 'issue';
    }
}