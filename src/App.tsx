import { Button, Container, Form, Nav, Navbar, Card } from 'solid-bootstrap';
import type { Component } from 'solid-js';
import CalculatorSubnetV4 from './components/calculator-subnet';
import { BitArray } from './lib/binary';
import { AddressV4, calculateSubnetV4, SubnetMaskV4 } from './lib/ip/v4';
import { AddressV6, calculateSubnetV6, SubnetMaskV6 } from './lib/ip/v6';

const App: Component = () => {
  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Navbar</Navbar.Brand>
          <Nav class="me-auto">

          </Nav>
        </Container>
      </Navbar>
      <Container>
        <Card bg='dark' text='light' class='mt-4'>
          <Card.Body>
            <CalculatorSubnetV4 />
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};

export default App;
