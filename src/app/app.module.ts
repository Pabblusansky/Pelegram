import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
// import { AppComponent } from './app.component';
import { routes } from './app.routes';

@NgModule({
  declarations: [],
  imports: [
    BrowserModule,
    RouterModule.forRoot(routes), // Configure RouterModule with routes
    // AppComponent,
  ],
  providers: [],
  // bootstrap: [AppComponent]
})
export class AppModule { }