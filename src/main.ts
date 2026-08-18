import { mount } from 'svelte';
import App from './components/App.svelte';
import './styles/tokens.css';

const target = document.getElementById('app');
if (!target) throw new Error('missing #app mount point');

export default mount(App, { target });
