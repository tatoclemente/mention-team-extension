import * as vscode from 'vscode';
import { execSync } from 'child_process';

export class GitUtils {
    static getCurrentUser(): string {
        try {
            // Intentar obtener usuario de GitHub desde git config
            const githubUser = execSync('git config github.user', { encoding: 'utf8' }).trim();
            if (githubUser) {
                return githubUser;
            }
        } catch (error) {
            // Fallback: intentar extraer del remote origin
            try {
                const remote = execSync('git config remote.origin.url', { encoding: 'utf8' }).trim();
                const match = remote.match(/github\.com[:\/]([^\/]+)/);
                if (match && match[1]) {
                    return match[1];
                }
            } catch {}
        }
        
        return 'currentuser';
    }

    static getCurrentDate(): string {
        return new Date().toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}