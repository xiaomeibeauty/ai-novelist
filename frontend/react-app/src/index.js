import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux'; // 引入 Provider
import { store } from './store'; // 引入 store
import './index.css';
import App from './App';
import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile, faFolder, faPlus, faCaretRight, faCaretDown } from '@fortawesome/free-solid-svg-icons';

// 将需要的图标添加到库中，这样就可以在任何地方使用它们
library.add(faFile, faFolder, faPlus, faCaretRight, faCaretDown);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <Provider store={store}> {/* 使用 Provider 包裹 App */}
      <App />
    </Provider>
);