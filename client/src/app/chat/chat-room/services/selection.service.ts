import { Injectable } from '@angular/core';
import { Message } from '../../chat.model';
import { ChatApiService } from '../../services/chat-api.service';
import { ConfirmationService } from '../../../shared/services/confirmation.service';
import { LoggerService } from '../../../services/logger.service';

export interface SelectionContext {
  messages: () => Message[];
  messagesWithDividers: () => any[];
  userId: () => string | null;
  updateMessagesWithDividers: () => void;
  detectChanges: () => void;
  showToast: (msg: string, duration?: number) => void;
  formatTimestamp: (ts: string) => string;
  removeMessages: (ids: string[]) => void;
  chatApiService: ChatApiService;
  confirmationService: ConfirmationService;
  logger: LoggerService;
}

@Injectable()
export class SelectionService {
  isActive = false;
  selectedMessagesMap = new Map<string, Message>();
  private isDragging = false;
  private lastDraggedMessageId: string | null = null;
  private ctx!: SelectionContext;

  init(context: SelectionContext): void {
    this.ctx = context;
  }

  activate(message: Message): void {
    if (!message || !message._id) return;

    this.isActive = true;
    this.selectedMessagesMap.clear();

    message.isSelected = true;
    this.selectedMessagesMap.set(message._id, message);

    this.updateInArrays(message);

    const messages = this.ctx.messages();
    messages.forEach(msg => {
      if (msg._id === message._id) {
        msg.isSelected = true;
      }
    });

    this.ctx.updateMessagesWithDividers();
    this.ctx.detectChanges();
  }

  toggle(message: Message, forcedState?: boolean): void {
    if (!message || !message._id) return;

    const isCurrentlySelected = this.selectedMessagesMap.has(message._id);

    if (typeof forcedState === 'boolean') {
      if (forcedState === true && !isCurrentlySelected) {
        message.isSelected = true;
        this.selectedMessagesMap.set(message._id, message);
      } else if (forcedState === false && isCurrentlySelected) {
        message.isSelected = false;
        this.selectedMessagesMap.delete(message._id);
      }
    } else {
      if (isCurrentlySelected) {
        message.isSelected = false;
        this.selectedMessagesMap.delete(message._id);
      } else {
        message.isSelected = true;
        this.selectedMessagesMap.set(message._id, message);
      }
    }

    this.updateInArrays(message);

    if (this.selectedMessagesMap.size === 0) {
      this.cancel();
    }

    this.ctx.detectChanges();
  }

  private updateInArrays(updatedMessage: Message): void {
    if (!updatedMessage._id) return;

    const messages = this.ctx.messages();
    const msgIndex = messages.findIndex(m => m._id === updatedMessage._id);
    if (msgIndex !== -1) {
      messages[msgIndex].isSelected = updatedMessage.isSelected;
    }

    const messagesWithDividers = this.ctx.messagesWithDividers();
    const msgDividerIndex = messagesWithDividers.findIndex(
      (item: any) => item.type === 'message' && item._id === updatedMessage._id
    );

    if (msgDividerIndex !== -1) {
      messagesWithDividers[msgDividerIndex].isSelected = updatedMessage.isSelected;
    }

    this.ctx.updateMessagesWithDividers();
  }

  cancel(): void {
    this.isActive = false;

    this.ctx.messages().forEach(msg => msg.isSelected = false);
    this.ctx.messagesWithDividers().forEach((item: any) => {
      if (item.type === 'message') {
        item.isSelected = false;
      }
    });

    this.selectedMessagesMap.clear();
    this.ctx.detectChanges();
  }

  getSelectedArray(): Message[] {
    const selectedMessages = Array.from(this.selectedMessagesMap.values());
    return selectedMessages.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  copySelected(): void {
    const selected = this.getSelectedArray();
    if (selected.length === 0) return;

    const userId = this.ctx.userId();
    const textToCopy = selected.map(msg => {
      let prefix = "";
      if (msg.forwarded && msg.originalSenderName) {
        prefix += `[Forwarded from ${msg.originalSenderName}]\n`;
      }
      const sender = msg.senderName || (msg.senderId === userId ? "You" : "Other");
      return `${prefix}${sender} [${this.ctx.formatTimestamp(msg.timestamp)}]:\n${msg.content}`;
    }).join('\n\n');

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        this.ctx.showToast(`${selected.length} message${selected.length > 1 ? 's' : ''} copied`);
        this.cancel();
      })
      .catch(err => {
        this.ctx.logger.error('Failed to copy messages:', err);
        this.ctx.showToast('Failed to copy messages');
      });
  }

  getForwardPayload(): any {
    const selected = this.getSelectedArray();
    if (selected.length === 0) return null;

    if (selected.length === 1) {
      return selected[0];
    } else {
      return {
        _id: 'multiple',
        content: `${selected.length} messages`,
      };
    }
  }

  canDeleteSelected(): boolean {
    if (this.selectedMessagesMap.size === 0) return false;

    const userId = this.ctx.userId();
    for (const msg of this.selectedMessagesMap.values()) {
      const senderId = typeof msg.senderId === 'object' && msg.senderId !== null
        ? (msg.senderId as any)._id
        : msg.senderId;

      if (senderId !== userId) {
        return false;
      }
    }

    return true;
  }

  async deleteSelected(): Promise<void> {
    const selectedMessageIds = Array.from(this.selectedMessagesMap.keys());
    if (selectedMessageIds.length === 0) return;

    if (!this.canDeleteSelected()) {
      this.ctx.showToast("You can only delete your own messages in bulk.");
      return;
    }

    const confirmed = await this.ctx.confirmationService.confirm({
      title: 'Delete Messages',
      message: `Are you sure you want to delete ${selectedMessageIds.length} message${selectedMessageIds.length > 1 ? 's' : ''}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (confirmed) {
      this.ctx.chatApiService.deleteMultipleMessages(selectedMessageIds).subscribe({
        next: (response) => {
          this.ctx.showToast(`${response.deletedCount} message${response.deletedCount > 1 ? 's' : ''} deleted`);
          this.ctx.removeMessages(selectedMessageIds);
          this.ctx.updateMessagesWithDividers();
          this.cancel();
        },
        error: (err) => {
          this.ctx.logger.error("Error deleting messages", err);
          this.ctx.showToast('Failed to delete messages');
        }
      });
    }
  }

  selectAll(): void {
    const messages = this.ctx.messages();
    if (messages.length === 0) return;

    this.isActive = true;
    this.selectedMessagesMap.clear();

    messages.forEach(message => {
      if (message._id) {
        message.isSelected = true;
        this.selectedMessagesMap.set(message._id, message);
      }
    });

    this.ctx.updateMessagesWithDividers();
    this.ctx.detectChanges();
    this.ctx.showToast(`Selected ${this.selectedMessagesMap.size} messages`, 2000);
  }

  onMouseDown(event: MouseEvent, message: Message): void {
    if (!this.isActive) return;
    if (event.button !== 0) return;

    this.isDragging = true;
    this.lastDraggedMessageId = message._id || null;

    event.preventDefault();
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.isDragging || !this.isActive) return;

    const elementsUnderCursor = document.elementsFromPoint(event.clientX, event.clientY);

    for (const element of elementsUnderCursor) {
      const messageId = this.getMessageIdFromElement(element as HTMLElement);

      if (messageId && messageId !== this.lastDraggedMessageId) {
        const messages = this.ctx.messages();
        const message = messages.find(m => m._id === messageId);

        if (message) {
          this.toggle(message);
          this.lastDraggedMessageId = messageId;
          break;
        }
      }
    }
  }

  onMouseUp(): void {
    this.isDragging = false;
    this.lastDraggedMessageId = null;
  }

  private getMessageIdFromElement(element: HTMLElement): string | null {
    let current: HTMLElement | null = element;

    while (current) {
      if (current.id && current.id.startsWith('message-')) {
        return current.id.substring(8);
      }
      current = current.parentElement;
    }

    return null;
  }
}
