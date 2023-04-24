import { Button, Container, Form, Nav, Navbar, Card, NavLink } from 'solid-bootstrap';
import type { Component } from 'solid-js';
import CalculatorSubnetV4 from './components/calculator-subnet';
import ViewRouter, { createViewHref } from './components/view-router';

const App: Component = () => {
  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Navbar</Navbar.Brand>
          <Nav class="me-auto">
            <NavLink href={createViewHref("subnet-calculator-v4")}>Subnet calculator v4</NavLink>
            <NavLink href={createViewHref("suitable-address-calculator-v4")}>suitable</NavLink>
          </Nav>
        </Container>
      </Navbar>
      <Container>
        <Card bg='dark' text='light' class='mt-4'>
          <Card.Body>
            <ViewRouter views={[
              {
                element: (
                  <CalculatorSubnetV4 />
                ),
                name: "subnet-calculator-v4"
              }
            ]} 
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
