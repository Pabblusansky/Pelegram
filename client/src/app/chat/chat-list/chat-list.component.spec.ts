import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

// With no token in tests the component redirects to /auth/login; accept any
// URL so the navigation resolves instead of rejecting.
const ACCEPT_ANY_ROUTE = [{ path: '**', children: [] }];
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatListComponent } from './chat-list.component';

describe('ChatListComponent', () => {
  let component: ChatListComponent;
  let fixture: ComponentFixture<ChatListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatListComponent],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter(ACCEPT_ANY_ROUTE)],
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
