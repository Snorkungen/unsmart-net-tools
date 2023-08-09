import { Container, Nav, Navbar, Card, NavLink } from 'solid-bootstrap';
import { Component, For } from 'solid-js';
import ViewRouter, { createViewHref } from './components/view-router';
import { views } from './view-manifest';

const App: Component = () => {
  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Navbar</Navbar.Brand>
          <Nav class="me-auto">
            <For each={views}>{([component, name]) => (
              <NavLink href={createViewHref(component.name)}>{name}</NavLink>
            )}</For>
          </Nav>
        </Container>
      </Navbar>
      <Container>
        <Card bg='dark' text='light' class='mt-4'>
          <Card.Body>
            <ViewRouter views={views.map(([Comp]) => ({
              element: <Comp />,
              name: Comp.name
            }))}
              fallback={(
                <h1>View not found</h1>
              )}
            />
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};

export default App;
