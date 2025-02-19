import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { routes } from './app.routes'; // Ensure this file exists and exports a Routes array
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
@NgModule({
  imports: [RouterModule.forRoot(routes), BrowserAnimationsModule], // Configure the router with the application's routes
  exports: [RouterModule] // Export RouterModule to make it available throughout the app
})
export class AppRoutingModule {}
