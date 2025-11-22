import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { Mention } from './mentionParser';

interface TrackedMention {
    hash: string;
    issueNumber?: number;
    file: string;
    line: number;
}

export class MentionTracker {
    private sentMentions: Map<string, TrackedMention>;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        const stored = context.globalState.get<TrackedMention[]>('sentMentions', []);
        this.sentMentions = new Map(stored.map(m => [m.hash, m]));
    }

    private getMentionHash(mention: Mention): string {
        const data = `${mention.file}:${mention.line}:${mention.username}:${mention.message}`;
        return crypto.createHash('md5').update(data).digest('hex');
    }

    isSent(mention: Mention): boolean {
        return this.sentMentions.has(this.getMentionHash(mention));
    }

    async markAsSent(mention: Mention, issueNumber?: number): Promise<void> {
        const hash = this.getMentionHash(mention);
        this.sentMentions.set(hash, {
            hash,
            issueNumber,
            file: mention.file,
            line: mention.line
        });
        await this.save();
    }

    getIssueNumber(mention: Mention): number | undefined {
        const hash = this.getMentionHash(mention);
        return this.sentMentions.get(hash)?.issueNumber;
    }

    getAllTracked(): TrackedMention[] {
        return Array.from(this.sentMentions.values());
    }

    async remove(hash: string): Promise<void> {
        this.sentMentions.delete(hash);
        await this.save();
    }

    private async save(): Promise<void> {
        await this.context.globalState.update('sentMentions', Array.from(this.sentMentions.values()));
    }

    async clear(): Promise<void> {
        this.sentMentions.clear();
        await this.save();
    }
}
