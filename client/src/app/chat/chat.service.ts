import { Injectable } from '@angular/core';
import { Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { Chat, Message, MessageDeletedEvent, MediaGalleryResponse } from './chat.model';
export type { MediaGalleryResponse } from './chat.model';
import { User } from './chat.model';
import { ChatApiService } from './services/chat-api.service';
import { SocketService } from './services/socket.service';
import { ChatStateService } from './services/chat-state.service';

/**
 * Thin facade that delegates to ChatApiService, SocketService, and ChatStateService.
 * Kept temporarily so existing consumers don't break during incremental migration.
 * Once all consumers are updated to inject the new services directly, delete this file.
 */
@Injectable({
  providedIn: 'root',
})
export class ChatService {

  // --- Observable streams (delegated to SocketService / ChatStateService) ---
  public newMessage$!: Observable<Message>;
  public messageDeleted$!: Observable<MessageDeletedEvent>;
  public userStatuses$!: Observable<Record<string, { lastActive: string; online: boolean }>>;
  public chatUpdated$!: Observable<Chat>;
  public messageReactionUpdated$!: Observable<{ messageId: string; reactions: import('./chat.model').Reaction[] }>;
  public chatDeletedGlobally$!: Observable<import('./chat.model').ChatDeletedGloballyData>;
  public newChatCreated$!: Observable<Chat>;
  public userRemovedFromChat$!: Observable<{ chatId: string; reason: string }>;
  public totalUnreadCount$!: Observable<number>;

  constructor(
    private chatApiService: ChatApiService,
    private socketService: SocketService,
    private chatStateService: ChatStateService
  ) {
    this.newMessage$ = this.socketService.newMessage$;
    this.messageDeleted$ = this.socketService.messageDeleted$;
    this.userStatuses$ = this.socketService.userStatuses$;
    this.chatUpdated$ = this.socketService.chatUpdated$;
    this.messageReactionUpdated$ = this.socketService.messageReactionUpdated$;
    this.chatDeletedGlobally$ = this.socketService.chatDeletedGlobally$;
    this.newChatCreated$ = this.socketService.newChatCreated$;
    this.userRemovedFromChat$ = this.socketService.userRemovedFromChat$;
    this.totalUnreadCount$ = this.chatStateService.totalUnreadCount$;
  }

  // --- Socket methods ---
  getSocket(): Socket | undefined { return this.socketService.getSocket(); }
  logoutAndReconnectSocket(): void { this.socketService.logoutAndReconnectSocket(); }
  joinChat(chatId: string): void { this.socketService.joinChat(chatId); }
  sendMessage(chatId: string, content: string, replyToDetails?: Message['replyTo']): Observable<Message> {
    return this.socketService.sendMessage(chatId, content, replyToDetails);
  }
  receiveMessages(callback: (message: Message) => void): void { this.socketService.receiveMessages(callback); }
  sendTyping(chatId: string, isTyping: boolean): void { this.socketService.sendTyping(chatId, isTyping); }
  onTyping(): Observable<{ chatId: string; senderId: string; isTyping: boolean }> { return this.socketService.onTyping(); }
  onMessageEdited(): Observable<Message> { return this.socketService.onMessageEdited(); }
  onMessageDeleted(): Observable<MessageDeletedEvent> { return this.socketService.onMessageDeleted(); }
  onMessageStatusUpdated() { return this.socketService.onMessageStatusUpdated(); }
  toggleReaction(messageId: string, reactionType: string): void { this.socketService.toggleReaction(messageId, reactionType); }

  // --- User status methods ---
  getUserLastActive(userId: string): Observable<Date | null> { return this.socketService.getUserLastActive(userId); }
  isUserOnline(userId: string): Observable<boolean> { return this.socketService.isUserOnline(userId); }
  getUserStatusText(userId: string): Observable<string> { return this.socketService.getUserStatusText(userId); }

  // --- State methods ---
  setActiveChatId(chatId: string | null): void { this.chatStateService.setActiveChatId(chatId); }
  getActiveChatId(): string | null { return this.chatStateService.getActiveChatId(); }
  updateTotalUnreadCount(count: number): void { this.chatStateService.updateTotalUnreadCount(count); }

  // --- API methods ---
  getApiUrl(): string { return this.chatApiService.getApiUrl(); }
  getChat(chatId: string): Observable<Chat> { return this.chatApiService.getChat(chatId); }
  getChats(): Observable<Chat[]> { return this.chatApiService.getChats(); }
  getMessages(chatId: string): Observable<Message[]> | undefined { return this.chatApiService.getMessages(chatId); }
  getMessagesBefore(chatId: string, beforeMessageId: string, limit: number = 20): Observable<Message[]> {
    return this.chatApiService.getMessagesBefore(chatId, beforeMessageId, limit);
  }
  getSavedMessagesChat(): Observable<Chat> { return this.chatApiService.getSavedMessagesChat(); }
  getUsers(): Observable<User[]> { return this.chatApiService.getUsers(); }
  createOrGetDirectChat(userId: string): Observable<Chat> { return this.chatApiService.createOrGetDirectChat(userId); }
  editMessage(messageId: string, newContent: string): Observable<Message> { return this.chatApiService.editMessage(messageId, newContent); }
  deleteMessage(messageId: string): Observable<{ success: boolean; messageId: string }> { return this.chatApiService.deleteMessage(messageId); }
  updateChatWithLastMessage(chatId: string): Observable<Chat> { return this.chatApiService.updateChatWithLastMessage(chatId); }
  markMessagesAsRead(chatId: string) { return this.chatApiService.markMessagesAsRead(chatId); }
  searchMessages(chatId: string, query: string): Observable<Message[]> { return this.chatApiService.searchMessages(chatId, query); }
  loadMessageContext(chatId: string, messageId: string, limitPerSide: number = 15): Observable<Message[]> {
    return this.chatApiService.loadMessageContext(chatId, messageId, limitPerSide);
  }
  pinMessage(chatId: string, messageId: string): Observable<Chat> { return this.chatApiService.pinMessage(chatId, messageId); }
  unpinMessage(chatId: string): Observable<Chat> { return this.chatApiService.unpinMessage(chatId); }
  forwardMessage(messageId: string, targetChatId: string): Observable<Message> {
    return this.chatApiService.forwardMessage(messageId, targetChatId);
  }
  forwardMultipleMessages(messageIds: string[], targetChatId: string): Observable<{ message: string }> {
    return this.chatApiService.forwardMultipleMessages(messageIds, targetChatId);
  }
  deleteMultipleMessages(messageIds: string[]): Observable<{ deletedCount: number }> {
    return this.chatApiService.deleteMultipleMessages(messageIds);
  }
  getAvailableChatsForForward(): Observable<Chat[]> { return this.chatApiService.getAvailableChatsForForward(); }
  deleteChat(chatId: string): Observable<{ message: string }> { return this.chatApiService.deleteChat(chatId); }
  uploadMediaFile(
    chatId: string, file: File, caption?: string, replyToContext?: Message['replyTo'], durationInSeconds?: number
  ): Observable<{ message: string; savedMessage: Message }> {
    return this.chatApiService.uploadMediaFile(chatId, file, caption, replyToContext, durationInSeconds);
  }
  createGroupChat(groupData: { name: string; participantIds: string[] }): Observable<Chat> {
    return this.chatApiService.createGroupChat(groupData);
  }
  leaveGroup(chatId: string): Observable<{ message: string }> { return this.chatApiService.leaveGroup(chatId); }
  updateGroupName(chatId: string, newName: string): Observable<Chat> { return this.chatApiService.updateGroupName(chatId, newName); }
  updateGroupAvatar(chatId: string, file: File): Observable<Chat> { return this.chatApiService.updateGroupAvatar(chatId, file); }
  addGroupParticipants(chatId: string, participantIds: string[]): Observable<Chat> {
    return this.chatApiService.addGroupParticipants(chatId, participantIds);
  }
  removeGroupParticipant(chatId: string, participantId: string): Observable<Chat> {
    return this.chatApiService.removeGroupParticipant(chatId, participantId);
  }
  deleteGroup(chatId: string): Observable<{ message: string }> { return this.chatApiService.deleteGroup(chatId); }
  searchUsers(query: string): Observable<User[]> { return this.chatApiService.searchUsers(query); }
  deleteGroupAvatar(chatId: string): Observable<Chat> { return this.chatApiService.deleteGroupAvatar(chatId); }
  getChatMedia(
    chatId: string, type: 'images' | 'videos' | 'documents' | 'audio' = 'images', page: number = 1, limit: number = 30
  ): Observable<MediaGalleryResponse> {
    return this.chatApiService.getChatMedia(chatId, type, page, limit);
  }
}
