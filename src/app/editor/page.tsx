import { Suspense } from 'react';
import EditorClientWrapper from './EditorClientWrapper';

// This page component itself can be a Server Component or a Client Component.
// The key is that the component using useSearchParams (EditorClientWrapper)
// is dynamically loaded within a Suspense boundary.

export default function EditorPage() {
    return (
        <div>
            {/* You can add other static or server-rendered content here if needed */}
            <Suspense
                fallback={
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            height: '100vh',
                            color: 'white', // Or your theme's text color
                            backgroundColor: '#333' // Or your theme's background
                        }}
                    >
                        <p>Loading Editor...</p>
                    </div>
                }
            >
                <EditorClientWrapper />
            </Suspense>
        </div>
    );
}
