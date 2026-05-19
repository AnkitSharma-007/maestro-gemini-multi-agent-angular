import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/guide/guide.page').then((m) => m.GuidePage),
  },
  {
    path: 'architect',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  { path: '**', redirectTo: '' },
];
