import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ChatRoomComponent } from './chat-room.component';
import { ChatApiService } from '../services/chat-api.service';
import { Message } from '../chat.model';

describe('ChatRoomComponent', () => {
  let component: ChatRoomComponent;
  let fixture: ComponentFixture<ChatRoomComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatRoomComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatRoomComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('registers the scrollToBottomButtonAnimation trigger the template binds to', () => {
    const meta = (ChatRoomComponent as any).ɵcmp;
    const names = (meta.data?.animation ?? []).map((a: any) => a.name);
    expect(names).toContain('scrollToBottomButtonAnimation');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('jumping to a message outside the loaded window', () => {
    const msg = (n: number): Message => ({
      _id: `m${n}`,
      chatId: 'chat1',
      senderId: 'other',
      content: `message ${n}`,
      timestamp: new Date(2026, 0, 1, 0, n).toISOString(),
    } as Message);
    const range = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => msg(from + i));

    beforeEach(() => {
      component.chatId = 'chat1';
      component.userId = 'me';
    });

    it('replaces a disjoint window instead of merging into a gap', () => {
      component.messages = range(50, 100);

      (component as any).showMessageContext(range(1, 30));

      expect(component.messages.map(m => m._id)).toEqual(range(1, 30).map(m => m._id));
      expect(component.hasNewerMessages).toBeTrue();
      expect(component.isAtBottom).toBeFalse();
    });

    it('merges context that touches the loaded window', () => {
      component.messages = range(50, 100);

      (component as any).showMessageContext(range(35, 60));

      expect(component.messages.length).toBe(66);
      expect(component.messages[0]._id).toBe('m35');
      expect(component.hasNewerMessages).toBeFalse();
    });

    it('pages forwards until it reaches the live end', () => {
      const api = TestBed.inject(ChatApiService);
      const after = spyOn(api, 'getMessagesAfter').and.returnValues(of(range(31, 60)), of(range(61, 70)));
      component.messages = range(1, 30);
      component.hasNewerMessages = true;

      (component as any).loadNewerMessages();
      expect(after).toHaveBeenCalledWith('chat1', 'm30', 30);
      expect(component.hasNewerMessages).toBeTrue();

      (component as any).loadNewerMessages();
      expect(after).toHaveBeenCalledWith('chat1', 'm60', 30);
      expect(component.messages.length).toBe(70);
      expect(component.hasNewerMessages).toBeFalse();
    });

    it('drops a forward page if the window was replaced meanwhile', () => {
      const api = TestBed.inject(ChatApiService);
      spyOn(api, 'getMessagesAfter').and.callFake(() => {
        component.messages = range(90, 100);
        return of(range(31, 40));
      });
      component.messages = range(1, 30);
      component.hasNewerMessages = true;

      (component as any).loadNewerMessages();

      expect(component.messages.map(m => m._id)).toEqual(range(90, 100).map(m => m._id));
    });

    it('holds back incoming messages while newer ones are unloaded', () => {
      component.messages = range(1, 30);
      component.hasNewerMessages = true;
      component.unreadMessagesCount = 0;

      (component as any).addOrUpdateMessage(msg(200));

      expect(component.messages.length).toBe(30);
      expect(component.unreadMessagesCount).toBe(1);
    });

    it('jumps to the latest messages when the user sends one across a gap', () => {
      const load = spyOn(component, 'loadMessages');
      component.messages = range(1, 30);
      component.hasNewerMessages = true;

      (component as any).addOrUpdateMessage({ ...msg(200), senderId: 'me' }, true);

      expect(load).toHaveBeenCalled();
      expect(component.messages.length).toBe(30);
    });

    it('scroll to bottom reloads the latest page when there is a gap', () => {
      const load = spyOn(component, 'loadMessages');
      component.hasNewerMessages = true;

      component.scrollToBottom(true);

      expect(load).toHaveBeenCalled();
    });
  });
});
