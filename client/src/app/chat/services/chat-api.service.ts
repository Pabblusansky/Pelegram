import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, catchError, map, tap } from 'rxjs';
import { Chat, Message, MediaGalleryResponse } from '../chat.model';
import { User } from '../chat.model';
import { LoggerService } from '../../services/logger.service';
import { TokenService } from '../../services/token.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ChatApiService {
  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private router: Router,
    private logger: LoggerService,
    private tokenService: TokenService
  ) {}

  public getApiUrl(): string {
    return this.apiUrl;
  }

  private getHeaders(): HttpHeaders | undefined {
    const token = this.tokenService.getToken();
    if (!token) {
      this.router.navigate(['/login']);
      return undefined;
    }
    return new HttpHeaders().set('Authorization', `Bearer ${token}`);
  }

  private getHttpOptions(): { headers: HttpHeaders } {
    const headers = this.getHeaders();
    if (!headers) {
      throw new Error('No token provided');
    }
    return { headers };
  }

  handleError = (error: HttpErrorResponse | Error): Observable<never> => {
    this.logger.error('ChatApiService: An API error occurred:', error);
    let errorMessage = 'An unknown error occurred!';
    if (error instanceof HttpErrorResponse) {
      if (error.error instanceof ErrorEvent) {
        errorMessage = `Error: ${error.error.message}`;
      } else if (error.status) {
        errorMessage = `Error Code: ${error.status}\nMessage: ${error.message || (error.error && error.error.message) || error.statusText}`;
      }
    } else {
      errorMessage = error.message || errorMessage;
    }
    return throwError(() => new Error(errorMessage));
  }

  getChat(chatId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.get<Chat>(`${this.apiUrl}/chats/${chatId}`, { headers });
  }

  getChats(): Observable<Chat[]> {
    const headers = this.getHeaders();
    if (!headers) {
      this.logger.error('getChats: No headers (token likely missing).');
      return throwError(() => new Error('Not authorized for getChats'));
    }
    return this.http.get<Chat[]>(`${this.apiUrl}/chats`, { headers })
      .pipe(catchError(this.handleError));
  }

  getMessages(chatId: string): Observable<Message[]> | undefined {
    const headers = this.getHeaders();
    if (!headers) return;
    return this.http.get<Message[]>(`${this.apiUrl}/messages/${chatId}`, { headers });
  }

  getMessagesBefore(chatId: string, beforeMessageId: string, limit: number = 20): Observable<Message[]> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.get<Message[]>(
      `${this.apiUrl}/messages/${chatId}?before=${beforeMessageId}&limit=${limit}`,
      { headers }
    ).pipe(
      map((messages: Message[]) => Array.isArray(messages) ? messages : []),
      catchError(error => {
        this.logger.error('Error loading older messages:', error);
        return throwError(() => error);
      })
    );
  }

  getSavedMessagesChat(): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) {
      return throwError(() => new Error('Not authorized to get Saved Messages chat.'));
    }
    return this.http.get<Chat>(`${this.apiUrl}/chats/me/saved-messages`, { headers })
      .pipe(catchError(this.handleError));
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users`);
  }

  createOrGetDirectChat(userId: string): Observable<Chat> {
    const token = this.tokenService.getToken();
    if (!token) {
      this.logger.error('No token found, cannot create chat');
      return throwError(() => new Error('Authentication required'));
    }
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
    return this.http.post<Chat>(`${this.apiUrl}/chats`, { recipientId: userId }, { headers })
      .pipe(
        catchError(error => {
          this.logger.error('Error creating or getting direct chat:', error);
          return throwError(() => new Error(`Failed to create chat: ${error.message}`));
        })
      );
  }

  editMessage(messageId: string, newContent: string): Observable<Message> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    const now = new Date().toISOString();
    return this.http.patch<Message>(
      `${this.apiUrl}/messages/${messageId}`,
      { content: newContent, edited: true, editedAt: now },
      { headers }
    ).pipe(
      catchError(error => {
        this.logger.error('Error editing message:', error);
        return throwError(() => error);
      })
    );
  }

  deleteMessage(messageId: string): Observable<{ success: boolean; messageId: string }> {
    const headers = this.getHeaders();
    return headers ?
      this.http.delete<{ success: boolean; messageId: string }>(`${this.apiUrl}/messages/${messageId}`, { headers })
      : throwError(() => new Error('Not authorized'));
  }

  updateChatWithLastMessage(chatId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.get<Chat>(`${this.apiUrl}/chats/${chatId}`, { headers });
  }

  markMessagesAsRead(chatId: string) {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('No token provided'));
    const url = `${this.apiUrl}/chats/${chatId}/mark-as-read`;
    return this.http.post(url, {}, { headers });
  }

  searchMessages(chatId: string, query: string): Observable<Message[]> {
    const headers = this.getHeaders();
    if (!headers) {
      this.logger.error('SearchMessages: Not authorized');
      return throwError(() => new Error('Not authorized'));
    }
    let params = new HttpParams();
    params = params.append('query', query);
    const url = `${this.apiUrl}/messages/search/${chatId}`;
    return this.http.get<Message[]>(url, { headers, params })
      .pipe(
        map(messages => messages.map(msg => ({
          ...msg,
          timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : new Date(msg.timestamp).toISOString()
        }))),
        catchError(error => {
          this.logger.error('Error searching messages in service:', error);
          return this.handleError(error);
        })
      );
  }

  loadMessageContext(chatId: string, messageId: string, limitPerSide: number = 15): Observable<Message[]> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    const params = new HttpParams().set('limit', limitPerSide.toString());
    return this.http.get<Message[]>(`${this.apiUrl}/messages/${chatId}/context/${messageId}`, { headers, params })
      .pipe(
        map(messages => messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp).toISOString()
        }))),
        catchError(this.handleError)
      );
  }

  pinMessage(chatId: string, messageId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.patch<Chat>(`${this.apiUrl}/chats/${chatId}/pin/${messageId}`, {}, { headers })
      .pipe(catchError(this.handleError));
  }

  unpinMessage(chatId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.patch<Chat>(`${this.apiUrl}/chats/${chatId}/unpin`, {}, { headers })
      .pipe(catchError(this.handleError));
  }

  forwardMessage(messageId: string, targetChatId: string): Observable<Message> {
    const url = `${this.apiUrl}/messages/${messageId}/forward`;
    return this.http.post<Message>(url, { targetChatId }, this.getHttpOptions()).pipe(
      catchError(this.handleError)
    );
  }

  forwardMultipleMessages(messageIds: string[], targetChatId: string): Observable<{ message: string }> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.post<{ message: string }>(`${this.apiUrl}/messages/forward-multiple`, { messageIds, targetChatId }, { headers })
      .pipe(catchError(this.handleError));
  }

  deleteMultipleMessages(messageIds: string[]): Observable<{ deletedCount: number }> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.request<{ deletedCount: number }>(
      'delete',
      `${this.apiUrl}/messages/delete-multiple`,
      { headers, body: { messageIds } }
    ).pipe(catchError(this.handleError));
  }

  getAvailableChatsForForward(): Observable<Chat[]> {
    const url = `${this.apiUrl}/messages/available-for-forward`;
    return this.http.get<Chat[]>(url, this.getHttpOptions()).pipe(
      catchError(this.handleError)
    );
  }

  deleteChat(chatId: string): Observable<{ message: string }> {
    const headers = this.getHeaders();
    if (!headers) {
      this.router.navigate(['/login']);
      return throwError(() => new Error('Not authorized for deleteChat'));
    }
    return this.http.delete<{ message: string }>(`${this.apiUrl}/chats/${chatId}`, { headers });
  }

  uploadMediaFile(
    chatId: string,
    file: File,
    caption?: string,
    replyToContext?: Message['replyTo'],
    durationInSeconds?: number
  ): Observable<{ message: string; savedMessage: Message }> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized for file upload'));

    const formData = new FormData();
    formData.append('mediaFile', file, file.name);
    if (caption) formData.append('caption', caption);
    if (durationInSeconds !== undefined) formData.append('duration', durationInSeconds.toString());
    if (replyToContext) {
      try {
        formData.append('replyTo', JSON.stringify(replyToContext));
      } catch (e) {
        this.logger.error('ChatApiService: Error stringifying replyToContext:', e);
      }
    }

    const finalHeaders = headers.delete('Content-Type');
    const uploadUrl = `${this.apiUrl}/api/files/upload/chat/${chatId}`;

    return this.http.post<{ message: string; savedMessage: Message }>(uploadUrl, formData, {
      headers: finalHeaders
    }).pipe(
      catchError(error => {
        this.logger.error('ChatApiService: HTTP POST error:', error);
        return this.handleError(error);
      })
    );
  }

  createGroupChat(groupData: { name: string; participantIds: string[] }): Observable<Chat> {
    const httpOptions = this.getHttpOptions();
    const payload = { name: groupData.name, participants: groupData.participantIds };
    return this.http.post<Chat>(`${this.apiUrl}/chats/group`, payload, httpOptions)
      .pipe(catchError(this.handleError));
  }

  leaveGroup(chatId: string): Observable<{ message: string }> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized to leave group.'));
    return this.http.post<{ message: string }>(`${this.apiUrl}/chats/${chatId}/leave`, {}, { headers })
      .pipe(catchError(this.handleError));
  }

  updateGroupName(chatId: string, newName: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized to update group name.'));
    return this.http.patch<Chat>(
      `${this.apiUrl}/chats/${chatId}/group/name`,
      { name: newName },
      { headers }
    ).pipe(catchError(this.handleError));
  }

  updateGroupAvatar(chatId: string, file: File): Observable<Chat> {
    const token = this.tokenService.getToken();
    if (!token) {
      this.router.navigate(['/login']);
      return throwError(() => new Error('Not authorized for group avatar update'));
    }
    const formData = new FormData();
    formData.append('avatar', file, file.name);
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });
    return this.http.patch<Chat>(`${this.apiUrl}/chats/${chatId}/group/avatar`, formData, { headers }).pipe(
      catchError((error: HttpErrorResponse) => {
        this.logger.error('ChatApiService: Error updating group avatar:', error);
        let errorMessage = 'Failed to update group avatar.';
        if (error.error && typeof error.error.message === 'string') {
          errorMessage = error.error.message;
        } else if (typeof error.message === 'string') {
          errorMessage = error.message;
        }
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  addGroupParticipants(chatId: string, participantIds: string[]): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized to add participants'));
    return this.http.post<Chat>(
      `${this.apiUrl}/chats/${chatId}/group/participants`,
      { participantIds },
      { headers }
    ).pipe(catchError(this.handleError));
  }

  removeGroupParticipant(chatId: string, participantId: string): Observable<Chat> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized to remove participant'));
    return this.http.delete<Chat>(
      `${this.apiUrl}/chats/${chatId}/group/participants/${participantId}`,
      { headers }
    ).pipe(catchError(this.handleError));
  }

  deleteGroup(chatId: string): Observable<{ message: string }> {
    return this.deleteChat(chatId);
  }

  searchUsers(query: string): Observable<User[]> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized to search users'));
    return this.http.get<User[]>(
      `${this.apiUrl}/chats/search?query=${encodeURIComponent(query)}`,
      { headers }
    ).pipe(catchError(this.handleError));
  }

  deleteGroupAvatar(chatId: string): Observable<Chat> {
    const token = this.tokenService.getToken();
    if (!token) {
      this.router.navigate(['/login']);
      return throwError(() => new Error('Not authorized for group avatar deletion'));
    }
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });
    return this.http.delete<Chat>(`${this.apiUrl}/chats/${chatId}/group/avatar`, { headers }).pipe(
      catchError((error: HttpErrorResponse) => {
        this.logger.error('ChatApiService: Error deleting group avatar:', error);
        let errorMessage = 'Failed to delete group avatar.';
        if (error.error && typeof error.error.message === 'string') {
          errorMessage = error.error.message;
        } else if (typeof error.message === 'string') {
          errorMessage = error.message;
        }
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  getChatMedia(
    chatId: string,
    type: 'images' | 'videos' | 'documents' | 'audio' = 'images',
    page: number = 1,
    limit: number = 30
  ): Observable<MediaGalleryResponse> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized to get chat media.'));
    let params = new HttpParams()
      .set('type', type)
      .set('page', page.toString())
      .set('limit', limit.toString());
    const url = `${this.apiUrl}/chats/${chatId}/media`;
    return this.http.get<MediaGalleryResponse>(url, { headers, params }).pipe(
      catchError(this.handleError)
    );
  }

  loadInitialUserStatuses(): Observable<Record<string, { lastActive: string; online: boolean }>> {
    const headers = this.getHeaders();
    if (!headers) return throwError(() => new Error('Not authorized'));
    return this.http.get<Record<string, { lastActive: string; online: boolean }>>(`${this.apiUrl}/api/users/status`, { headers });
  }
}
