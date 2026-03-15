import { Injectable } from '@angular/core';
import { Chat, Message, Reaction } from '../../chat.model';
import { ChatApiService } from '../../services/chat-api.service';
import { SocketService } from '../../services/socket.service';
import { ConfirmationService } from '../../../shared/services/confirmation.service';
import { LoggerService } from '../../../services/logger.service';
import { SelectionService } from './selection.service';

export interface MessageActionsContext {
  messages: () => Message[];
  messagesWithDividers: () => any[];
  userId: () => string | null;
  chatId: () => string | null;
  chatDetails: () => Chat | null;
  updateMessagesWithDividers: () => void;
  detectChanges: () => void;
  showToast: (msg: string, duration?: number) => void;
  removeMessages: (ids: string[]) => void;
  focusMessageInput: () => void;
  chatApiService: ChatApiService;
  socketService: SocketService;
  confirmationService: ConfirmationService;
  logger: LoggerService;
}

@Injectable()
export class MessageActionsService {
  activeContextMenuId: string | null = null;
  menuPosition: { x: number; y: number } = { x: 0, y: 0 };
  selectedMessageId: string | null = null;
  replyingToMessage: Message | null = null;
  pinnedMessageDetails: Message | null = null;
  messagetoForward: any = null;
  showForwardDialogue = false;
  editAnimationTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  availableReactions: string[] = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  private ctx!: MessageActionsContext;

  constructor(private selectionService: SelectionService) {}

  init(context: MessageActionsContext): void {
    this.ctx = context;
  }

  cleanup(): void {
    this.editAnimationTimeouts.forEach(timeout => clearTimeout(timeout));
    this.editAnimationTimeouts.clear();
  }

  getSelectedMessage(): Message | null {
    if (!this.activeContextMenuId) {
      return null;
    }

    const messages = this.ctx.messages();
    const messageFromMainArray = messages.find(
      (msg: Message) => msg._id === this.activeContextMenuId
    );

    if (messageFromMainArray) {
      return messageFromMainArray;
    } else {
      const messagesWithDividers = this.ctx.messagesWithDividers();
      const messageFromDividers = messagesWithDividers.find(
        (item: any) => item.type === 'message' && item._id === this.activeContextMenuId
      );
      if (messageFromDividers) {
        return messageFromDividers as Message;
      } else {
        this.ctx.logger.error('getSelectedMessage: Message NOT FOUND anywhere for ID:', this.activeContextMenuId);
      }
    }
    return null;
  }

  showContextMenu(event: MouseEvent, message: Message): void {
    if (this.selectionService.isActive) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (!message || !message._id) {
      this.ctx.logger.error('Cannot show context menu: Invalid message object', message);
      return;
    }

    this.activeContextMenuId = message._id;
    this.selectedMessageId = message._id;

    const messages = this.ctx.messages();
    const actualMessage = messages.find(m => m._id === this.activeContextMenuId);

    if (!actualMessage) {
      this.ctx.logger.error('CONTEXT_MENU_ERROR: Could not find actual message in this.messages for ID:', this.activeContextMenuId);
      this.activeContextMenuId = null;
      return;
    }

    const userId = this.ctx.userId();
    const MenuWidth = 220;
    // Base items: Reply, Copy, Forward, Pin, Select = 5
    // Own message adds: Edit, Delete = +2
    // Group + own + readBy adds: Read by = +1
    let itemCount = 5;
    if (message.senderId === userId) {
      itemCount += 2;
      if (message.readBy && message.readBy.length > 0) {
        itemCount += 1;
      }
    }
    const MenuHeight = (itemCount * 40) + 60;
    const cursorOffset = 5;

    let positionX = event.clientX;
    let positionY = event.clientY;

    if (positionX + MenuWidth + cursorOffset > window.innerWidth) {
      positionX = positionX - MenuWidth - cursorOffset;
    } else {
      positionX = positionX + cursorOffset;
    }
    if (positionX < 10) {
      positionX = 10;
    }

    if (positionY - MenuHeight - cursorOffset < 0) {
      positionY = positionY + cursorOffset;

      if (positionY + MenuHeight > window.innerHeight) {
        positionY = window.innerHeight - MenuHeight - 10;
      }
    } else {
      positionY = positionY - MenuHeight - cursorOffset;
    }
    if (positionY < 10) {
      positionY = 10;
    }

    if (positionX + MenuWidth > window.innerWidth) {
      positionX = window.innerWidth - MenuWidth - 10;
      if (positionX < 10) positionX = 10;
    }

    this.menuPosition = { x: positionX, y: positionY };
    this.activeContextMenuId = message._id;
    this.selectedMessageId = message._id;
    this.ctx.detectChanges();
  }

  onReactionClick(messageId: string | undefined | null, reactionType: string): void {
    if (!messageId) return;
    this.ctx.socketService.toggleReaction(messageId, reactionType);
    this.activeContextMenuId = null;
    this.selectedMessageId = null;
  }

  handleReactionUpdate(messageId: string, newReactions: Reaction[]): void {
    const messages = this.ctx.messages();
    const messageIndex = messages.findIndex(m => m._id === messageId);

    if (messageIndex !== -1) {
      const originalMessage = messages[messageIndex];
      messages[messageIndex] = {
        ...originalMessage,
        reactions: newReactions
      };

      this.ctx.updateMessagesWithDividers();
      this.ctx.detectChanges();
    }
  }

  startReply(message: Message): void {
    this.replyingToMessage = message;
    this.activeContextMenuId = null;
    const messageInput = document.querySelector('app-message-input textarea') as HTMLTextAreaElement;
    if (messageInput) {
      messageInput.focus();
    }
  }

  cancelReply(): void {
    this.replyingToMessage = null;
  }

  startEdit(message: Message, isLastMessageEdit: boolean = false): void {
    this.activeContextMenuId = null;
    const messages = this.ctx.messages();
    const messageInArray = messages.find(m => m._id === message._id);
    const userId = this.ctx.userId();
    if (!messageInArray || messageInArray.senderId !== userId) return;
    messageInArray.isEditing = true;
    messageInArray.editedContent = messageInArray.content;

    const messagesWithDividers = this.ctx.messagesWithDividers();
    const messageInDividers = messagesWithDividers.find(
      (item: any) => item.type === 'message' && item._id === message._id
    );
    if (messageInDividers) {
      messageInDividers.isEditing = true;
      messageInDividers.editedContent = messageInDividers.content;
    }
    this.selectedMessageId = null;
    this.ctx.detectChanges();

    setTimeout(() => {
      const messageId = messageInArray._id;
      if (!messageId) return;
      const messageElement = document.getElementById('message-' + messageInArray._id);
      const editContainerElement = messageElement?.querySelector('.edit-container') as HTMLElement;
      const textarea = messageElement?.querySelector('.edit-textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
      }
      if (messageElement && editContainerElement) {
        const messagesContainer = document.querySelector('.messages');
        if (messagesContainer) {
          const containerRect = messagesContainer.getBoundingClientRect();
          const editContainerRect = editContainerElement.getBoundingClientRect();
          const isFullyVisible =
            editContainerRect.top >= containerRect.top &&
            editContainerRect.bottom <= containerRect.bottom;

          if (!isFullyVisible || isLastMessageEdit) {
            let scrollAdjustment = 0;

            if (editContainerRect.bottom > containerRect.bottom) {
              scrollAdjustment = (editContainerRect.bottom - containerRect.bottom) + 40;
            }
            else if (editContainerRect.top < containerRect.top) {
              scrollAdjustment = (editContainerRect.top - containerRect.top) - 15;
            }

            if (scrollAdjustment !== 0 || (isLastMessageEdit && messagesContainer.scrollTop + messagesContainer.clientHeight < messagesContainer.scrollHeight - 5)) {
              messagesContainer.scrollTop += scrollAdjustment;
              if (isLastMessageEdit && Math.abs(messagesContainer.scrollTop + messagesContainer.clientHeight - messagesContainer.scrollHeight) < 5) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
              }
            }
          }
        }
      }
    }, 50);
  }

  cancelEdit(messageFromUI: Message): void {
    const messageId = messageFromUI._id;

    messageFromUI.isEditing = false;
    delete messageFromUI.editedContent;

    const messages = this.ctx.messages();
    const messageInArray = messages.find(m => m._id === messageId);
    if (messageInArray) {
      messageInArray.isEditing = false;
      delete messageInArray.editedContent;
    }

    this.ctx.focusMessageInput();
    this.ctx.detectChanges();
  }

  saveMessageEdit(messageFromUI: Message): void {
    const messageId = messageFromUI._id;
    const messages = this.ctx.messages();
    const messageInArray = messages.find(m => m._id === messageId);

    if (!messageInArray) {
      this.ctx.logger.error('Message to save not found in main messages array:', messageId);
      this.cancelEdit(messageFromUI);
      return;
    }

    const editedContentFromUI = messageFromUI.editedContent;

    if (!editedContentFromUI?.trim()) {
      this.cancelEdit(messageFromUI);
      return;
    }

    const newContent = editedContentFromUI.trim();

    if (messageInArray.content === newContent) {
      messageInArray.isEditing = false;
      delete messageInArray.editedContent;
      messageFromUI.isEditing = false;
      delete messageFromUI.editedContent;
      this.ctx.detectChanges();
      return;
    }

    const originalContent = messageInArray.content;

    messageInArray.content = newContent;
    messageInArray.isEditing = false;
    messageInArray.edited = true;
    messageInArray.editedAt = new Date();
    delete messageInArray.editedContent;

    messageFromUI.content = newContent;
    messageFromUI.isEditing = false;
    messageFromUI.edited = true;
    messageFromUI.editedAt = messageInArray.editedAt;
    delete messageFromUI.editedContent;

    this.ctx.updateMessagesWithDividers();
    this.ctx.detectChanges();

    this.ctx.chatApiService.editMessage(messageInArray._id!, newContent).subscribe({
      next: (updatedMessageFromServer) => {
        const allMessages = this.ctx.messages();
        const finalMessageIndex = allMessages.findIndex(m => m._id === updatedMessageFromServer._id);
        if (finalMessageIndex !== -1) {
          allMessages[finalMessageIndex] = {
            ...allMessages[finalMessageIndex],
            content: updatedMessageFromServer.content,
            edited: updatedMessageFromServer.edited,
            editedAt: updatedMessageFromServer.editedAt,
            isEditing: false,
          };
          delete allMessages[finalMessageIndex].editedContent;
        }
        this.ctx.updateMessagesWithDividers();
        this.ctx.focusMessageInput();
        this.ctx.detectChanges();
      },
      error: (err) => {
        this.ctx.logger.error('Failed to edit message on server:', err);
        const allMessages = this.ctx.messages();
        const messageToRevert = allMessages.find(m => m._id === messageId);
        if (messageToRevert) {
          messageToRevert.content = originalContent;
          messageToRevert.isEditing = false;
          messageToRevert.edited = messageFromUI.edited;
          messageToRevert.editedAt = messageFromUI.editedAt;
          delete messageToRevert.editedContent;
        }
        messageFromUI.content = originalContent;
        messageFromUI.isEditing = true;
        messageFromUI.editedContent = editedContentFromUI;

        this.ctx.updateMessagesWithDividers();
        this.ctx.focusMessageInput();
        this.ctx.detectChanges();
        this.ctx.showToast('Failed to save edit. Please try again.');
      }
    });
  }

  onEditTextareaKeydown(event: KeyboardEvent, messageItemFromUI: Message): void {
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        return;
      }
      event.preventDefault();
      this.saveMessageEdit(messageItemFromUI);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEdit(messageItemFromUI);
    }
  }

  forwardMessage(message: Message): void {
    if (!message) return;

    this.activeContextMenuId = null;
    this.selectedMessageId = null;

    this.messagetoForward = message;
    this.showForwardDialogue = true;
    this.ctx.detectChanges();
  }

  confirmForward(targetChatId: string): void {
    if (!this.messagetoForward) {
      this.selectionService.cancel();
      this.cancelForward();
      return;
    }

    if (this.messagetoForward._id === 'multiple') {
      const selectedMessages = this.selectionService.getSelectedArray();
      if (selectedMessages.length > 0) {
        this.ctx.chatApiService.forwardMultipleMessages(selectedMessages.map(m => m._id!), targetChatId)
          .subscribe({
            next: () => {
              this.ctx.showToast(`${selectedMessages.length} messages forwarded`);
              this.selectionService.cancel();
              this.cancelForward();
            },
            error: (err) => {
              this.ctx.showToast('Failed to forward messages');
              this.ctx.logger.error("Error forwarding multiple messages", err);
              this.cancelForward();
            }
          });
      }
    } else if (this.messagetoForward._id) {
      this.ctx.chatApiService.forwardMessage(this.messagetoForward._id, targetChatId).subscribe({
        next: () => {
          this.ctx.showToast('Message forwarded successfully');
          this.selectionService.cancel();
          this.cancelForward();
        },
        error: (error) => {
          this.ctx.showToast('Failed to forward message');
          this.cancelForward();
        }
      });
    }
  }

  cancelForward(): void {
    this.showForwardDialogue = false;
    this.messagetoForward = null;
  }

  pinSelectedMessage(): void {
    const messageToPin = this.getSelectedMessage();
    const chatId = this.ctx.chatId();
    if (messageToPin && messageToPin._id && chatId) {
      this.ctx.chatApiService.pinMessage(chatId, messageToPin._id).subscribe({
        next: (updatedChat) => {
          this.ctx.showToast('Message pinned!');
          this.activeContextMenuId = null;
        },
        error: (err) => {
          this.ctx.logger.error('Error pinning message:', err);
          this.ctx.showToast('Failed to pin message.');
        }
      });
    }
  }

  unpinCurrentMessage(): void {
    const chatId = this.ctx.chatId();
    const chatDetails = this.ctx.chatDetails();
    if (chatId && chatDetails?.pinnedMessage) {
      this.ctx.chatApiService.unpinMessage(chatId).subscribe({
        next: (updatedChat) => {
          this.ctx.showToast('Message unpinned!');
        },
        error: (err) => {
          this.ctx.logger.error('Error unpinning message:', err);
          this.ctx.showToast('Failed to unpin message.');
        }
      });
    }
  }

  async deleteMessage(messageId: string | undefined): Promise<void> {
    if (!messageId) {
      if (this.activeContextMenuId) {
        messageId = this.activeContextMenuId;
      } else {
        return;
      }
    }

    this.activeContextMenuId = null;
    this.selectedMessageId = null;

    const confirmed = await this.ctx.confirmationService.confirm({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this message? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    if (confirmed) {
      this.ctx.chatApiService.deleteMessage(messageId).subscribe({
        next: () => {
          this.ctx.removeMessages([messageId!]);
          this.ctx.updateMessagesWithDividers();
          this.ctx.detectChanges();
        },
        error: (err) => {
          this.ctx.logger.error('Failed to delete message:', err);
          this.ctx.detectChanges();
        }
      });
    }
  }

  copyMessageText(message: Message): void {
    if (!message) return;

    this.activeContextMenuId = null;
    this.selectedMessageId = null;

    navigator.clipboard.writeText(message.content)
      .then(() => {
        this.ctx.showToast('Message copied to clipboard');
      })
      .catch(err => {
        this.ctx.showToast('Failed to copy message', err);
      });
  }

  applyEditAnimation(messageId: string): void {
    if (this.editAnimationTimeouts.has(messageId)) {
      clearTimeout(this.editAnimationTimeouts.get(messageId)!);
    }

    const messages = this.ctx.messages();
    const messageIndex = messages.findIndex(msg => msg._id === messageId);
    if (messageIndex === -1) return;

    messages[messageIndex].editedRecently = true;

    this.ctx.updateMessagesWithDividers();

    const timeout = setTimeout(() => {
      const allMessages = this.ctx.messages();
      const msgIndex = allMessages.findIndex(msg => msg._id === messageId);
      if (msgIndex !== -1) {
        allMessages[msgIndex].editedRecently = false;
        this.ctx.updateMessagesWithDividers();
        this.ctx.detectChanges();
      }
      this.editAnimationTimeouts.delete(messageId);
    }, 2000);

    this.editAnimationTimeouts.set(messageId, timeout);
  }
}
