import { redirect } from 'next/navigation';

/** Root redirects to Kanban pipeline — primary screen per implementation doc. */
export default function RootPage() {
  redirect('/pipeline');
}
