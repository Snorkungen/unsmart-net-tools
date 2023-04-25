import { Button, Container, Form, Nav, Navbar, Card, NavLink } from 'solid-bootstrap';
import type { Component } from 'solid-js';
import CalculatorSubnetV4 from './components/calculator-subnet';
import { CalculatorSuitableAddressV4 } from './components/calculator-suitable-address';
import ViewRouter, { createViewHref } from './components/view-router';

const App: Component = () => {
  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Navbar</Navbar.Brand>
          <Nav class="me-auto">
            <NavLink href={createViewHref(CalculatorSubnetV4.name)}>Subnet calculator v4</NavLink>
            <NavLink href={createViewHref(CalculatorSuitableAddressV4.name)}>suitable</NavLink>
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
                name: CalculatorSubnetV4.name
              },
              {
                element: (
                  <CalculatorSuitableAddressV4 />
                ),
                name: CalculatorSuitableAddressV4.name
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
